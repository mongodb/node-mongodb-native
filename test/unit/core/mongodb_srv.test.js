'use strict';
const fs = require('fs');
const path = require('path');
const parseConnectionString = require('../../../src/connection_string').parseConnectionString;
const expect = require('chai').expect;

describe('mongodb+srv', function() {
  it('should parse a default database', function(done) {
    parseConnectionString('mongodb+srv://test1.test.build.10gen.cc/somedb', (err, result) => {
      expect(err).to.not.exist;
      expect(result.auth.db).to.eql('somedb');
      done();
    });
  });

  describe('spec tests', function() {
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
        test: function(done) {
          parseConnectionString(test[1].uri, (err, result) => {
            if (test[1].error) {
              expect(err).to.exist;
              expect(result).to.not.exist;
            } else {
              expect(err).to.not.exist;
              expect(result).to.exist;
              if (test[1].options) {
                expect(result)
                  .property('options')
                  .to.matchMongoSpec(test[1].options);
              }
              if (
                test[1].parsed_options &&
                test[1].parsed_options.user &&
                test[1].parsed_options.password
              ) {
                expect(result.auth.username).to.equal(test[1].parsed_options.user);
                expect(result.auth.password).to.equal(test[1].parsed_options.password);
              }
            }
            done();
          });
        }
      });
    });
  });
});
