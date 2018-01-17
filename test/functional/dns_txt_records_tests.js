'use strict';

var fs = require('fs');
var path = require('path');
var parse = require('../../lib/url_parser');

function getTests() {
  return fs
    .readdirSync(path.join(__dirname, 'specs/dns-txt-records'))
    .filter(function(x) { return x.indexOf('json') !== -1; })
    .map(function(x) { return [x, fs.readFileSync(path.join(__dirname, 'specs/dns-txt-records', x), 'utf8')]; })
    .map(function(x) { return [path.basename(x[0], '.json'), JSON.parse(x[1])]; });
}

exports['mongodb+srv tests'] = {
  metadata: { requires: { topology: ['single'] } },
  test: function(configure, test) {
    console.log('Running DNS Initial Seedlist Discovery spec tests');

    var specs = getTests();
    specs.forEach(function (spec) {
      var comment = spec[1].comment ? spec[1].comment : spec[0];
      var uri = spec[1].uri;
      var options = spec[1].options;
      var error = spec[1].error;

      console.log('  ', comment);
      parse(uri, function(err, object) {
        if (error) {
          test.ok(err instanceof Error);
          test.equal(object, null);
          return;
        }

        test.equal(err, null);
        if (options) {
          if (options.replicaSet) {
            test.equal(object.rs_options.rs_name, options.replicaSet);
          }

          if (options.ssl) {
            test.equal(object.server_options.ssl, options.ssl);
          }
        }
      });
    });

    test.done();
  }
};
