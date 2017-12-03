'use strict';

const fs = require('fs'),
  path = require('path'),
  expect = require('chai').expect;

let testContext = {};
describe('Retryable Writes', function() {
  before(function() {
    const configuration = this.configuration;
    const MongoClient = configuration.require.MongoClient;
    const url = `${configuration.url()}&retryWrites=true`;

    return MongoClient.connect(url, { minSize: 1 }).then(function(client) {
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
          it(test.description, {
            metadata: {
              requires: { topology: ['single'], mongodb: '>=' + scenario.minServerVersion }
            },

            test: function() {
              let setupPromise;
              if (test.failPoint) {
                const command = { configureFailPoint: 'onPrimaryTransactionalWrite' };
                if (test.failPoint.mode) command.mode = test.failPoint.mode;
                if (test.failPoint.data) command.data = test.failPoint.data;
                return testContext.db.executeDbAdminCommand(command);
              } else {
                setupPromise = Promise.resolve();
              }

              return setupPromise
                .then(() => executeScenarioTest(scenario, test, this.configuration, testContext))
                .then(() => {
                  if (test.failPoint) {
                    return testContext.db.executeDbAdminCommand({
                      configureFailPoint: 'onPrimaryTransactionalWrite',
                      mode: 'off'
                    });
                  }
                });
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
  const collection = context.db.collection(
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
        result = result.then(() => expect(false).to.be.true).catch(err => {
          expect(err).to.exist;
          expect(err.message).to.not.match(/expected false to be true/);
        });
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
          .then(collectionResults => {
            expect(collectionResults).to.eql(test.outcome.collection.data);
          });
      }
    });
}
