'use strict';

const fs = require('fs');
const expect = require('chai').expect;
const parse = require('mongodb-core').parseConnectionString;

describe('URI Options (spec)', function() {
  fs
    .readdirSync(`${__dirname}/spec/uri-options`)
    .filter(filename => filename.match(/\.json$/))
    .forEach(filename => {
      const specString = fs.readFileSync(`${__dirname}/spec/uri-options/${filename}`, 'utf8');
      const specData = JSON.parse(specString);

      describe(filename, () => {
        specData.tests.forEach(test => {
          const itFn = test.warning ? it.skip : it;

          itFn(test.description, {
            metadata: { requires: { topology: 'single' } },
            test: function(done) {
              parse(test.uri, {}, (err, result) => {
                expect(err).to.not.exist;

                // extract all keys from result.options, including nested keys
                let compareKeys = [];
                for (let optionKey in result.options) {
                  compareKeys.push(optionKey);
                  if (typeof result.options[optionKey] === 'object') {
                    Object.keys(result.options[optionKey]).forEach(nestedOptionKey => {
                      compareKeys.push(nestedOptionKey);
                    });
                  }
                }

                Object.keys(test.options).every(option => {
                  expect(compareKeys.indexOf(option) === -1).to.equal(false);
                });

                done();
              });
            }
          });
        });
      });
    });
});
