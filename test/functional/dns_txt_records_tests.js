'use strict';

var fs = require('fs');
var path = require('path');

var parse = require('../../lib/url_parser');

// node test/runner.js -t functional -f dns_txt_records_tets.js

function getTests() {
  return fs
    .readdirSync(path.join(__dirname, 'specs/dns-txt-records'))
    .filter(function(x) {x.indexOf('json') !== -1})
    .map(function(x) {[x, fs.readFileSync(path.join(__dirname, 'specs/dns-txt-records', x), 'utf8')]})
    .map(function(x) {[path.basename(x[0], '.json'), JSON.parse(x[1])]});
}

getTests().forEach(function (t) {
  if (!test[1].comment) test[1].comment = test[0];

  exports[test[1].comment] = {
    test: function(configure, test) {
      parse(test[1].url, function(err, object) {
        if (test[1].error) {
          test.equal(err, new Error);
          test.equal(object, null);
        } else {
          test.equal(err, null);
          if (test[1].options && test[1].options.replicaSet) {
            test.equal(object.rs_options.rs_name, test[1].options.replicaSet);
          }
          if (test[1].options && test[1].options.ssl) {
            test.equal(object.server_options.ssl, test[1].options.ssl);
          }
        }
        t.done();
      })
    }
  }
});
