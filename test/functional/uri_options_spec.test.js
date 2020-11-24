'use strict';

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-subset'));

const { parseOptions } = require('../../src/connection_string');
const { loadSpecTests } = require('../spec');

describe('URI Options (spec)', function () {
  loadSpecTests('uri-options').forEach(suite => {
    describe(suite.name, () => {
      suite.tests.forEach(test => {
        const itFn = test.warning ? it.skip : it;

        itFn(`${test.description}`, function () {
          try {
            const options = parseOptions(test.uri, {});
            if (test.valid === true) {
              if (test.options.compressors != null) {
                options.compressors = options.compression.compressors;
                options.zlibCompressionLevel = options.compression.zlibCompressionLevel;
              }
              expect(options).to.containSubset(test.options);
            }
          } catch (err) {
            expect(err).to.be.an.instanceof(Error);
          }
        });
      });
    });
  });
});
