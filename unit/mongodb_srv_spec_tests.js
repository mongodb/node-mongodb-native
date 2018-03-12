'use strict';
const fs = require('fs');
const path = require('path');
const parseConnectionString = require('../../../lib/uri_parser');
const expect = require('chai').expect;

describe('mongodb+srv (spec)', function() {
  it('should parse a default database', function(done) {
    parseConnectionString('mongodb+srv://test5.test.build.10gen.cc/somedb', (err, result) => {
      expect(result.auth.db).to.eql('somedb');
      done();
    });
  });

  const specPath = path.join(__dirname, '../spec', 'initial-dns-seedlist-discovery');
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

            if (test[1].options && test[1].options.replicaSet) {
              expect(result.options.replicaset).to.equal(test[1].options.replicaSet);
            }

            if (test[1].options && test[1].options.ssl) {
              expect(result.options.ssl).to.equal(test[1].options.ssl);
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
