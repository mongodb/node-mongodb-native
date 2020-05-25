'use strict';

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-subset'));

const { parseConnectionString: parse } = require('../../src/connection_string');
const { MongoParseError } = require('../../src/error');
const { loadSpecTests } = require('../spec');

describe('URI Options (spec)', function() {
  loadSpecTests('uri-options').forEach(suite => {
    describe(suite.name, () => {
      suite.tests.forEach(test => {
        const itFn = test.warning ? it.skip : it;

        itFn(test.description, {
          metadata: { requires: { topology: 'single' } },
          test: function(done) {
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
