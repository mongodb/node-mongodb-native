'use strict';

const chai = require('chai');
const expect = chai.expect;
const TestRunnerContext = require('./spec-runner').TestRunnerContext;
const generateTopologyTests = require('./spec-runner').generateTopologyTests;
const loadSpecTests = require('../spec').loadSpecTests;
const { withMonitoredClient } = require('./shared');

const mock = require('../tools/mock');
const { MongoClient } = require('../../src');

describe('Write Concern', function () {
  describe('spec tests', function () {
    const testContext = new TestRunnerContext();
    const testSuites = loadSpecTests('read-write-concern/operation');

    after(() => testContext.teardown());
    before(function () {
      return testContext.setup(this.configuration);
    });

    generateTopologyTests(testSuites, testContext);
  });

  it(
    'should respect writeConcern from uri',
    withMonitoredClient('insert', { queryOptions: { w: 0 } }, function (client, events, done) {
      expect(client.writeConcern).to.eql({ w: 0 });
      client
        .db('test')
        .collection('test')
        .insertOne({ a: 1 }, (err, result) => {
          expect(err).to.not.exist;
          expect(result).to.exist;
          expect(events).to.be.an('array').with.lengthOf(1);
          expect(events[0]).to.containSubset({
            commandName: 'insert',
            command: {
              writeConcern: { w: 0 }
            }
          });
          done();
        });
    })
  );

  // TODO: once `read-write-concern/connection-string` spec tests are implemented these can likely be removed
  describe('test journal connection string option', function () {
    function journalOptionTest(client, events, done) {
      expect(client).to.have.nested.property('s.options.writeConcern');
      expect(client.s.options.writeConcern).to.satisfy(wc => wc.j || wc.journal);
      client
        .db('test')
        .collection('test')
        .insertOne({ a: 1 }, (err, result) => {
          expect(err).to.not.exist;
          expect(result).to.exist;
          expect(events).to.be.an('array').with.lengthOf(1);
          expect(events[0]).to.containSubset({
            commandName: 'insert',
            command: {
              writeConcern: { j: true }
            }
          });
          done();
        });
    }

    // baseline to confirm client option is working
    it(
      'should set write concern with j: true client option',
      withMonitoredClient(
        'insert',
        { clientOptions: { writeConcern: { j: true } } },
        journalOptionTest
      )
    );

    // ensure query option in connection string passes through
    it(
      'should set write concern with journal=true connection string option',
      withMonitoredClient('insert', { queryOptions: { journal: true } }, journalOptionTest)
    );
  });

  let server;
  before(() => {
    return mock.createServer().then(s => {
      server = s;
    });
  });

  after(() => mock.cleanup());

  it('should pipe writeConcern from client down to API call', function () {
    server.setMessageHandler(request => {
      if (request.document && request.document.ismaster) {
        return request.reply(mock.DEFAULT_ISMASTER);
      }
      expect(request.document.writeConcern).to.exist;
      expect(request.document.writeConcern.w).to.equal('majority');
      return request.reply({ ok: 1 });
    });

    const uri = `mongodb://${server.uri()}`;
    const client = new MongoClient(uri, { writeConcern: 'majority' });
    return client
      .connect()
      .then(() => {
        const db = client.db('wc_test');
        const collection = db.collection('wc');

        return collection.insertMany([{ a: 2 }]);
      })
      .then(() => {
        return client.close();
      });
  });
});
