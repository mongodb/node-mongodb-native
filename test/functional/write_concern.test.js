'use strict';

const chai = require('chai');
const expect = chai.expect;
const TestRunnerContext = require('./spec-runner').TestRunnerContext;
const generateTopologyTests = require('./spec-runner').generateTopologyTests;
const loadSpecTests = require('../spec').loadSpecTests;
const { withMonitoredClient } = require('./shared');

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
});
