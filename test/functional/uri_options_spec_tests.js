'use strict';

const fs = require('fs');
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-subset'));
const parse = require('mongodb-core').parseConnectionString;
const MongoParseError = require('mongodb-core').MongoParseError;

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
                if (test.valid === true) {
                  expect(err).to.not.exist;
                  expect(result.options).to.containSubset(test.options);
                } else {
                  console.log(err);
                  expect(err).to.exist;
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
