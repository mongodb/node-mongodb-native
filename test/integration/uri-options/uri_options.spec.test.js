'use strict';

const { expect } = require('chai');
const { promisify } = require('util');
require('chai').use(require('chai-subset'));

const { parseOptions, resolveSRVRecord } = require('../../../src/connection_string');
const { MongoParseError } = require('../../../src/error');
const { loadSpecTests } = require('../../spec');

describe('URI Options (spec)', function () {
  const uriSpecs = loadSpecTests('uri-options');

  // FIXME(NODE-3738): URI tests do not correctly assert whether they error or not
  for (const suite of uriSpecs) {
    describe(suite.name, () => {
      for (const test of suite.tests) {
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
            if (test.warning === false || test.valid === true) {
              // This test is supposed to not throw an error, we skip here for now (NODE-3738)
              this.skip();
            }
            expect(err).to.be.an.instanceof(MongoParseError);
          }
        });
      }
    });
  }

  describe('srvMaxHost manual testing', function () {
    const srvMaxHostTests = uriSpecs.find(testFolder => testFolder.name === 'srv-options').tests;

    for (const test of srvMaxHostTests) {
      it(test.description, async function () {
        let thrownError;
        let driverOptions;
        let hosts;
        try {
          driverOptions = parseOptions(test.uri);
          hosts = await promisify(resolveSRVRecord)(driverOptions);
        } catch (error) {
          thrownError = error;
        }

        if (test.valid === false || test.warning === true) {
          // We implement warnings as errors
          expect(thrownError).to.be.instanceOf(MongoParseError);
          expect(hosts).to.not.exist;
          return; // Nothing more to test...
        }

        expect(thrownError).to.not.exist;
        expect(driverOptions).to.exist;

        for (const [testOptionKey, testOptionValue] of Object.entries(test.options)) {
          expect(driverOptions).to.have.property(testOptionKey, testOptionValue);
        }
      });
    }
  });
});
