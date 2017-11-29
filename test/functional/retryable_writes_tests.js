'use strict';

var fs = require('fs'),
  path = require('path'),
  expect = require('chai').expect;

let testContext = {};
describe('Retryable Writes', function() {
  before(function() {
    var configuration = this.configuration;
    var MongoClient = configuration.require.MongoClient;
    return MongoClient.connect(configuration.url()).then(function(client) {
      testContext.client = client;
      testContext.db = client.db(configuration.db);
    });
  });

  fs
    .readdirSync(path.join(__dirname, 'spec', 'retryable-writes'))
    .filter(fileName => fileName.indexOf('.json') !== -1)
    .map(fileName => [
      path.basename(fileName, '.json'),
      JSON.parse(
        fs.readFileSync(path.join(path.join(__dirname, 'spec', 'retryable-writes'), fileName))
      )
    ])
    .forEach(testFileData => {
      const methodName = testFileData[0];
      const scenario = testFileData[1];

      describe(methodName, function() {
        scenario.tests.forEach(test => {
          beforeEach(function() {
            if (test.failpoint) {
              return testContext.db.command({
                configureFailPoint: 'onPrimaryTransactionalWrite',
                mode: test.failpoint.mode,
                data: test.failpoint.data
              });
            }
          });

          afterEach(function() {
            if (test.failpoint) {
              return testContext.db.command({
                configureFailPoint: 'onPrimaryTransactionalWrite',
                mode: 'off'
              });
            }
          });

          it(test.description, {
            metadata: {
              requires: { topology: ['single'], mongodb: '>=' + scenario.minServerVersion }
            },

            test: function() {
              return executeScenarioTest(scenario, test, this.configuration, testContext);
            }
          });
        });
      });
    });
});

const convertBulkWriteOperation = op => {
  const result = {};
  result[op.name] = op.arguments;
  return result;
};

function executeScenarioTest(scenario, test, configuration, context) {
  var collection = context.db.collection(
    'retryable_writes_test_' + scenario.name + '_' + test.operation.name
  );

  const errorHandler = err => {
    if (!err.message.match(/ns not found/)) throw err;
  };

  return collection
    .drop()
    .catch(errorHandler)
    .then(() => (scenario.data ? collection.insertMany(scenario.data) : Promise.resolve()))
    .then(() => {
      let args = [],
        options = {};
      if (test.operation.arguments) {
        Object.keys(test.operation.arguments).forEach(arg => {
          if (arg === 'requests') {
            args.push(test.operation.arguments[arg].map(convertBulkWriteOperation));
          } else if (arg === 'upsert') {
            options.upsert = test.operation.arguments[arg];
          } else if (arg === 'returnDocument') {
            const returnDocument = test.operation.arguments[arg];
            options.returnOriginal = returnDocument === 'After';
          } else {
            args.push(test.operation.arguments[arg]);
          }
        });

        if (Object.keys(options).length > 0) args.push(options);
      }

      let result = collection[test.operation.name].apply(collection, args);
      if (test.outcome.error) {
        result = result.then(() => expect(false).to.be.true).catch(err => expect(err).to.exist);
      } else if (test.outcome.result) {
        result = result.then(r => expect(r).to.deep.include(test.outcome.result));
      }

      return result;
    })
    .then(() => {
      if (test.outcome.collection) {
        return collection
          .find({})
          .toArray()
          .then(function(collectionResults) {
            expect(collectionResults).to.eql(test.outcome.collection.data);
          });
      }
    });
}
