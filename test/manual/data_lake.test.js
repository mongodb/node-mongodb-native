'use strict';
const { expect } = require('chai');
const path = require('path');
const { TestRunnerContext } = require('../functional/spec-runner');
const { gatherTestSuites } = require('../functional/spec-runner');
const { generateTopologyTests } = require('../functional/spec-runner');
const { withClient } = require('../functional/shared');

describe('Atlas Data Lake', function () {
  context('spec tests', function () {
    const testContext = new TestRunnerContext({
      skipPrepareDatabase: true,
      useSessions: false,
      user: 'mhuser',
      password: 'pencil'
    });

    let testSuites = gatherTestSuites(path.resolve(__dirname, '../spec/atlas-data-lake-testing'));

    after(() => testContext.teardown());
    before(function () {
      return testContext.setup(this.configuration);
    });

    generateTopologyTests(testSuites, testContext);
  });

  describe('prose Tests', function () {
    it(
      'should properly constructs and issues a killCursors command',
      withClient('mongodb://mhuser:pencil@localhost', function (client, done) {
        const db = client.db('admin');
        db.command({ killCursors: 'kill_cursor_collection' }, err => {
          expect(err).to.not.exist;
          done();
        });
      })
    );
    it(
      'should connect without authentication',
      withClient('mongodb://localhost', function (client, done) {
        expect(client).to.exist;
        done();
      })
    );
    it(
      'should connect with auth SCRAM-SHA-1',
      withClient('mongodb://mhuser:pencil@localhost?authMechanism=SCRAM-SHA-1', function (
        client,
        done
      ) {
        const db = client.db('admin');
        db.command({ killCursors: 'kill_cursor_collection' }, err => {
          expect(err).to.not.exist;
          done();
        });
      })
    );
    it(
      'should connect with auth SCRAM-SHA-256',
      withClient('mongodb://mhuser:pencil@localhost?authMechanism=SCRAM-SHA-256', function (
        client,
        done
      ) {
        const db = client.db('admin');
        db.command({ killCursors: 'kill_cursor_collection' }, err => {
          expect(err).to.not.exist;
          done();
        });
      })
    );
  });
});
