'use strict';
const fs = require('fs');
const path = require('path');
const { parseOptions, resolveSRVRecord } = require('../../../src/connection_string');
const expect = require('chai').expect;

describe('mongodb+srv', function () {
  it('should parse a default database', function () {
    const options = parseOptions('mongodb+srv://test1.test.build.10gen.cc/somedb');
    expect(options.dbName).to.equal('somedb');
    expect(options.srvHost).to.equal('test1.test.build.10gen.cc');
  });

  describe('spec tests', function () {
    const specPath = path.join(__dirname, '../../spec', 'initial-dns-seedlist-discovery');
    const testFiles = fs
      .readdirSync(specPath)
      .filter(x => x.indexOf('.json') !== -1)
      .map(x => [x, fs.readFileSync(path.join(specPath, x), 'utf8')])
      .map(x => [path.basename(x[0], '.json'), JSON.parse(x[1])]);

    testFiles.forEach(test => {
      if (!test[1].comment) {
        test[1].comment = test[0];
      }

      it(test[1].comment, {
        metadata: { requires: { topology: ['single'] } },
        test: function (done) {
          try {
            const options = parseOptions(test[1].uri);
            resolveSRVRecord(options, (err, result) => {
              if (test[1].error) {
                expect(err).to.exist;
                expect(result).to.not.exist;
              } else {
                expect(err).to.not.exist;
                expect(result).to.exist;
                // Implicit SRV options must be set.
                expect(options.directConnection).to.be.false;
                expect(options.tls).to.be.true;
                const testOptions = test[1].options;
                if (testOptions && testOptions.replicaSet) {
                  expect(options).to.have.property('replicaSet', testOptions.replicaSet);
                }
                if (testOptions && testOptions.authSource) {
                  expect(options).to.have.property('credentials');
                  expect(options.credentials.source).to.equal(testOptions.authSource);
                }
                if (
                  test[1].parsed_options &&
                  test[1].parsed_options.user &&
                  test[1].parsed_options.password
                ) {
                  expect(options.credentials.username).to.equal(test[1].parsed_options.user);
                  expect(options.credentials.password).to.equal(test[1].parsed_options.password);
                }
              }
              done();
            });
          } catch (error) {
            if (test[1].error) {
              expect(error).to.exist;
              done();
            } else {
              throw error;
            }
          }
        }
      });
    });
  });
});
