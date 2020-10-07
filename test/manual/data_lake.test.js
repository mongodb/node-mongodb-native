'use strict';
const { expect } = require('chai');
const path = require('path');
const TestRunnerContext = require('../functional/spec-runner').TestRunnerContext;
const gatherTestSuites = require('../functional/spec-runner').gatherTestSuites;
const generateTopologyTests = require('../functional/spec-runner').generateTopologyTests;
const withClient = require('../functional/shared').withClient;

describe('Data Lake - Spec Tests', function () {
  const testContext = new TestRunnerContext();
  testContext.dataLake = true;
  let testSuites = gatherTestSuites(path.resolve(__dirname, '../spec/atlas-data-lake-testing'));
  testSuites = testSuites.map(suite => {
    suite.runOn = [
      {
        topology: ['single']
      }
    ];
    return suite;
  });

  after(() => testContext.teardown());
  before(function () {
    this.configuration.user = 'mhuser';
    this.configuration.password = 'pencil';
    return testContext.setup(this.configuration);
  });

  generateTopologyTests(testSuites, testContext);
});

describe('Data Lake - Prose Tests', function () {
  it('should properly constructs and issues a killCursors command', function () {
    return withClient('mongodb://mhuser:pencil@localhost', (client, done) => {
      const db = client.db('admin');
      db.runCommand({ killCursors: 'kill_cursor_collection' }, err => {
        expect(err).to.not.exist;
        done();
      });
    });
  });
  it('should connect without authentication', function () {
    return withClient('mongodb://localhost', (client, done) => {
      expect(client).to.exist;
      done();
    });
  });
  it('should connect with auth SCRAM-SHA-1', function () {
    return withClient(
      'mongodb://mhuser:pencil@localhost?authMechanism=SCRAM-SHA-1',
      (client, done) => {
        const db = client.db('admin');
        db.runCommand({ killCursors: 'kill_cursor_collection' }, err => {
          expect(err).to.not.exist;
          done();
        });
      }
    );
  });
  it('should connect with auth SCRAM-SHA-256', function () {
    return withClient(
      'mongodb://mhuser:pencil@localhost?authMechanism=SCRAM-SHA-256',
      (client, done) => {
        const db = client.db('admin');
        db.runCommand({ killCursors: 'kill_cursor_collection' }, err => {
          expect(err).to.not.exist;
          done();
        });
      }
    );
  });
});
