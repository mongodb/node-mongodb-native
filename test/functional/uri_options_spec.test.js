'use strict';

const qs = require('querystring');
const url = require('url');
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-subset'));

const core = require('../../lib/core');
const parse = core.parseConnectionString;
const MongoParseError = core.MongoParseError;
const loadSpecTests = require('../spec').loadSpecTests;

describe('URI Options (spec)', function() {
  loadSpecTests('uri-options').forEach(suite => {
    describe(suite.name, () => {
      suite.tests.forEach(test => {
        const itFn = test.warning ? it.skip : it;

        itFn(test.description, {
          metadata: { requires: { topology: 'single' } },
          test: function(done) {
            const query = Object.assign({}, qs.parse(url.parse(test.uri).query));
            if (
              Object.prototype.hasOwnProperty.call(query, 'tlsDisableOCSPEndpointCheck') ||
              Object.prototype.hasOwnProperty.call(query, 'tlsDisableCertificateRevocationCheck')
            ) {
              return this.skip();
            }
            parse(test.uri, {}, (err, result) => {
              if (test.valid === true) {
                expect(err).to.not.exist;
                if (test.options.compressors != null) {
                  result.options.compressors = result.options.compression.compressors;
                  result.options.zlibCompressionLevel =
                    result.options.compression.zlibCompressionLevel;
                }
                expect(result.options).to.containSubset(test.options);
              } else {
                expect(err).to.be.an.instanceof(MongoParseError);
              }
              done();
            });
          }
        });
      });
    });
  });
});
