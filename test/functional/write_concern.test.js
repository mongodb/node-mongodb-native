'use strict';

const chai = require('chai');
const expect = chai.expect;
const TestRunnerContext = require('./spec-runner').TestRunnerContext;
const generateTopologyTests = require('./spec-runner').generateTopologyTests;
const loadSpecTests = require('../spec').loadSpecTests;
const { withMonitoredClient } = require('./shared');

describe('Write Concern', function() {
  describe('spec tests', function() {
    const testContext = new TestRunnerContext();
    const testSuites = loadSpecTests('read-write-concern/operation');

    after(() => testContext.teardown());
    before(function() {
      return testContext.setup(this.configuration);
    });

    generateTopologyTests(testSuites, testContext);
  });

  // TODO - implement `read-write-concern/connection-string` spec tests
  describe.only('test journal connection string option', function() {
    const dbOptions = { journal: true };
    const serverOptions = { j: true };
    function writeConcernJournalOptionTest(client, events, done) {
      expect(client).to.have.nested.property('s.options');
      const clientOptions = client.s.options;
      expect(clientOptions).to.containSubset({ j: true });
      client
        .db('test')
        .collection('test')
        .insertOne({ a: 1 }, (err, result) => {
          expect(err).to.not.exist;
          expect(result).to.exist;
          expect(events)
            .to.be.an('array')
            .with.lengthOf(1);
          expect(events[0]).to.containSubset({
            commandName: 'insert',
            command: {
              writeConcern: { j: true }
            }
          });
          done();
        });
    }
    it(
      'should set write concern with journal=true connection string option',
      withMonitoredClient('insert', { dbOptions }, writeConcernJournalOptionTest)
    );
    it(
      'should set write concern with j: true client option',
      withMonitoredClient('insert', { serverOptions }, writeConcernJournalOptionTest)
    );
  });
});
