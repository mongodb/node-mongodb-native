'use strict';

const fs = require('fs');
const chai = require('chai');
const expect = chai.expect;

const core = require('../../lib/core');
const parse = core.parseConnectionString;

describe('Read Write Concern (spec)', function() {
  describe('Connection String', function() {
    fs
      .readdirSync(`${__dirname}/spec/read-write-concern/connection-string`)
      .filter(filename => filename.match(/\.json$/))
      .forEach(filename => {
        const specString = fs.readFileSync(
          `${__dirname}/spec/read-write-concern/connection-string/${filename}`,
          'utf8'
        );
        const specData = JSON.parse(specString);

        describe(filename, () => {
          specData.tests.forEach(test => {
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
    fs
      .readdirSync(`${__dirname}/spec/read-write-concern/document`)
      .filter(filename => filename.match(/\.json$/))
      .forEach(filename => {
        const specString = fs.readFileSync(
          `${__dirname}/spec/read-write-concern/document/${filename}`,
          'utf8'
        );
        const specData = JSON.parse(specString);

        describe(filename, () => {
          specData.tests.forEach(test => {
            const itFn = test.warning ? it.skip : it;

            itFn(test.description, function(done) {
              let client;

              if (test.writeConcern != null) {
                const url = constructUrl(this.configuration.url(), test.writeConcern);
                try {
                  client = this.configuration.newClient(url);
                } catch (err) {
                  if (test.valid === false) {
                    expect(err).to.exist;
                    done();
                  }
                }

                client.connect((err, client) => {
                  expect(err).to.not.exist;
                  expect(client.s.writeConcern).to.deep.include(test.writeConcernDocument);
                  client.close(done);
                });
              } else if (test.readConcern != null) {
                client = this.configuration.newClient(this.configuration.url(), test.readConcern);

                client.connect((err, client) => {
                  if (test.valid === false) {
                    expect(err).to.exist;
                    client.close(done);
                  } else {
                    expect(err).to.not.exist;
                    expect(client.s.options).to.deep.include(test.readConcernDocument);
                    client.close(done);
                  }
                });
              }
            });
          });
        });
      });
  });
});

function constructUrl(url, writeConcernOptions) {
  Object.keys(writeConcernOptions).forEach(writeConcernKey => {
    url = url + `&${writeConcernKey}=${writeConcernOptions[writeConcernKey]}`;
  });

  return url;
}
