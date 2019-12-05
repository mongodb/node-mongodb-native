'use strict';

const parse = require('../../lib/url_parser');
const expect = require('chai').expect;
const loadSpecTests = require('../spec').loadSpecTests;

describe('Connection String (spec)', function() {
  loadSpecTests('connection-string').forEach(suite => {
    describe(suite.name, function() {
      suite.tests.forEach(test => {
        it(test.description, {
          metadata: { requires: { topology: 'single' } },
          test: function(done) {
            const valid = test.valid;

            parse(test.uri, {}, function(err, result) {
              if (valid === false) {
                expect(err).to.exist;
                expect(result).to.not.exist;
              } else {
                expect(err).to.not.exist;
                expect(result).to.exist;
              }

              done();
            });
          }
        });
      });
    });
  });
});
