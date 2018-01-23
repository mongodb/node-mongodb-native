'use strict';

var fs = require('fs');
var path = require('path');

var parse = require('../../lib/url_parser');
var expect = require('chai').expect;

function getTests() {
  return fs
    .readdirSync(path.join(__dirname, 'spec/dns-txt-records'))
    .filter(x => x.indexOf('json') !== -1)
    .map(x => [x, fs.readFileSync(path.join(__dirname, 'spec/dns-txt-records', x), 'utf8')])
    .map(x => [path.basename(x[0], '.json'), JSON.parse(x[1])]);
}

describe('DNS and TXT record tests', function() {
  getTests().forEach(function(test) {
    if (!test[1].comment) test[1].comment = test[0];

    it(test[1].comment, {
      metadata: {
        requires: { topology: ['single'] }
      },
      test: function(done) {
        parse(test[1].uri, function(err, object) {
          if (test[1].error) {
            expect(err).to.exist;
            expect(object).to.not.exist;
          } else {
            expect(err).to.be.null;
            expect(object).to.exist;
            if (test[1].options && test[1].options.replicaSet) {
              expect(object.rs_options.rs_name).to.equal(test[1].options.replicaSet);
            }
            if (test[1].options && test[1].options.ssl) {
              expect(object.server_options.ssl).to.equal(test[1].options.ssl);
            }
            if (
              test[1].parsed_options &&
              test[1].parsed_options.user &&
              test[1].parsed_options.password
            ) {
              expect(object.auth.user).to.equal(test[1].parsed_options.user);
              expect(object.auth.password).to.equal(test[1].parsed_options.password);
            }
          }
          done();
        });
      }
    });
  });
});
