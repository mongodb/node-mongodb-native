'use strict';

const fs = require('fs');
const path = require('path');
const expect = require('chai').expect;

describe('Retryable Writes', function() {
  let ctx = {};

  loadTestFiles().forEach(testFileData => {
    const methodName = testFileData[0];
    const scenario = testFileData[1];
    const topology = ['replicaset'];
    const mongodb = `>=${scenario.minServerVersion}`;

    describe(methodName, function() {
      scenario.tests.forEach(test => {
        it(test.description, {
          metadata: { requires: { topology, mongodb } },
          test: function() {
            // Step 1: Test Setup. Includes a lot of boilerplate stuff
            // like creating a client, dropping and refilling data collections,
            // and enabling failpoints
            return executeScenarioSetup(scenario, test, this.configuration, ctx).then(() =>
              // Step 2: Run the test
              executeScenarioTest(test, ctx)
            );
          }
        });
      });
    });
  });

  // Step 3: Test Teardown. Turn off failpoints, and close client
  afterEach(function() {
    if (!ctx.db || !ctx.client) {
      return;
    }

    return Promise.resolve()
      .then(() => (ctx.failPointName ? turnOffFailPoint(ctx.db, ctx.failPointName) : {}))
      .then(() => ctx.client.close())
      .then(() => (ctx = {}));
  });
});

function loadTestFiles() {
  return fs
    .readdirSync(path.join(__dirname, 'spec', 'retryable-writes'))
    .filter(fileName => fileName.indexOf('.json') !== -1)
    .map(fileName => [
      path.basename(fileName, '.json'),
      JSON.parse(
        fs.readFileSync(path.join(path.join(__dirname, 'spec', 'retryable-writes'), fileName))
      )
    ]);
}

function executeScenarioSetup(scenario, test, config, ctx) {
  const MongoClient = config.require.MongoClient;
  const url = config.url();
  const options = Object.assign({}, test.clientOptions, {
    haInterval: 100,
    monitorCommands: true,
    minSize: 10
  });

  ctx.failPointName = test.failPoint && test.failPoint.configureFailPoint;

  return MongoClient.connect(url, options)
    .then(client => (ctx.client = client))
    .then(() => (ctx.db = ctx.client.db(config.db)))
    .then(
      () =>
        (ctx.collection = ctx.db.collection(
          `retryable_writes_test_${config.name}_${test.operation.name}`
        ))
    )
    .then(() => ctx.collection.drop())
    .catch(err => {
      if (!err.message.match(/ns not found/)) {
        throw err;
      }
    })
    .then(() => (scenario.data ? ctx.collection.insertMany(scenario.data) : {}))
    .then(() => (test.failPoint ? ctx.db.executeDbAdminCommand(test.failPoint) : {}));
}

function executeScenarioTest(test, ctx) {
  return Promise.resolve()
    .then(() => {
      const args = generateArguments(test);

      let result = ctx.collection[test.operation.name].apply(ctx.collection, args);
      if (test.outcome.error) {
        result = result.then(() => expect(false).to.be.true).catch(err => {
          expect(err).to.exist;
          expect(err.message, 'expected operations to fail, but they succeeded').to.not.match(
            /expected false to be true/
          );
        });
      } else if (test.outcome.result) {
        const expected = transformToFixUpsertedId(test.outcome.result);
        result = result.then(transformToResultValue).then(r => expect(r).to.deep.include(expected));
      }

      return result;
    })
    .then(() => {
      if (test.outcome.collection) {
        return ctx.collection
          .find({})
          .toArray()
          .then(collectionResults => {
            expect(collectionResults).to.eql(test.outcome.collection.data);
          });
      }
    });
}

// Helper Functions

/**
 * Transforms the arguments from a test into actual arguments for our function calls
 */
function generateArguments(test) {
  const args = [];

  if (test.operation.arguments) {
    const options = {};
    Object.keys(test.operation.arguments).forEach(arg => {
      if (arg === 'requests') {
        args.push(test.operation.arguments[arg].map(convertBulkWriteOperation));
      } else if (arg === 'upsert') {
        options.upsert = test.operation.arguments[arg];
      } else if (arg === 'returnDocument') {
        const returnDocument = test.operation.arguments[arg];
        options.returnOriginal = returnDocument === 'Before';
      } else {
        args.push(test.operation.arguments[arg]);
      }
    });

    if (Object.keys(options).length > 0) {
      args.push(options);
    }
  }

  return args;
}

/**
 * Transforms a request arg into a bulk write operation
 */
function convertBulkWriteOperation(op) {
  return { [op.name]: op.arguments };
}

/**
 * Transforms output of a bulk write to conform to the test format
 */
function transformToResultValue(result) {
  return result && result.value ? result.value : result;
}

/**
 * Transforms expected values from the proper test format to
 * our (improper) actual output for upsertedId.
 */
function transformToFixUpsertedId(result) {
  if (Array.isArray(result)) {
    return result.map(transformToFixUpsertedId);
  }

  if (typeof result === 'object') {
    const ret = {};
    for (let key in result) {
      const value = result[key];
      if (key === 'upsertedId') {
        ret[key] = { index: 0, _id: value };
      } else {
        ret[key] = transformToFixUpsertedId(value);
      }
    }
    return ret;
  }

  return result;
}

/**
 * Runs a command that turns off a fail point
 */
function turnOffFailPoint(db, name) {
  return db.executeDbAdminCommand({
    configureFailPoint: name,
    mode: 'off'
  });
}
