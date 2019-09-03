'use strict';

const path = require('path');
const chai = require('chai');
const expect = chai.expect;
const gatherTestSuites = require('./runner/index.js').gatherTestSuites;
const core = require('../../lib/core');
const parse = core.parseConnectionString;

describe('Read Write Concern (spec)', function() {
  describe('Connection String', function() {
    const testSuites = gatherTestSuites(
      path.join(__dirname, 'spec', 'read-write-concern/connection-string')
    );

    testSuites.forEach(testSuite => {
      describe(testSuite.name, () => {
        testSuite.tests.forEach(test => {
          const itFn = test.warning ? it.skip : it;

          itFn(test.description, function(done) {
            parse(test.uri, {}, (err, result) => {
              if (test.valid === false) {
                expect(err).to.exist;
                done();
              }

              expect(err).to.not.exist;
              if (test.writeConcern != null && Object.keys(test.writeConcern).length !== 0) {
                if (test.valid === true) {
                  expect(result.options).to.deep.include(test.writeConcern);
                } else {
                  expect(result.options).to.not.deep.include(test.writeConcern);
                }
              }
              if (test.readConcern != null && Object.keys(test.readConcern).length !== 0) {
                if (test.valid === true) {
                  expect(result.options.readConcern).to.deep.equal(test.readConcern);
                } else {
                  expect(result.options).to.not.have.property('readConcern');
                }
              }
              done();
            });
          });
        });
      });
    });
  });

  describe('Document', function() {
    const testSuites = gatherTestSuites(
      path.join(__dirname, 'spec', 'read-write-concern/document')
    );

    testSuites.forEach(testSuite => {
      describe(testSuite.name, () => {
        testSuite.tests.forEach(test => {
          const itFn = test.warning ? it.skip : it;

          itFn(test.description, function(done) {
            let client;

            if (test.writeConcern != null) {
              const url = constructUrl(this.configuration.url(), test.writeConcern);
              try {
                client = this.configuration.newClient(url);
                expect(test.valid).to.be.true;
              } catch (err) {
                expect(test.valid).to.be.false;
                done();
              }

              connectAndValidate(client, test, done);
            } else if (test.readConcern != null) {
              client = this.configuration.newClient(this.configuration.url(), test.readConcern);
              connectAndValidate(client, test, done);
            }
          });
        });
      });
    });
  });
});

function connectAndValidate(client, test, callback) {
  client.connect((err, client) => {
    if (test.valid === false) {
      expect(err).to.exist;
      client.close(callback);
    } else {
      expect(err).to.not.exist;
      if (test.readConcern != null) {
        expect(client.s.options).to.deep.include(test.readConcernDocument);
      } else if (test.writeConcern != null) {
        expect(client.writeConcern).to.deep.include(test.writeConcernDocument);
      }
      client.close(callback);
    }
  });
}

function constructUrl(url, writeConcernOptions) {
  Object.keys(writeConcernOptions).forEach(writeConcernKey => {
    url = url + `&${writeConcernKey}=${writeConcernOptions[writeConcernKey]}`;
  });

  return url;
}
