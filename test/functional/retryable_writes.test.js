'use strict';

const expect = require('chai').expect;
const loadSpecTests = require('../spec').loadSpecTests;
const parseRunOn = require('../functional/spec-runner').parseRunOn;

describe('Retryable Writes', function () {
  let ctx = {};
  loadSpecTests('retryable-writes').forEach(suite => {
    const environmentRequirementList = parseRunOn(suite.runOn);
    environmentRequirementList.forEach(requires => {
      const suiteName = `${suite.name} - ${requires.topology.join()}`;

      describe(suiteName, {
        metadata: { requires },
        test: function () {
          // Step 3: Test Teardown. Turn off failpoints, and close client
          afterEach(function () {
            if (!ctx.db || !ctx.client) {
              return;
            }

            return Promise.resolve()
              .then(() => (ctx.failPointName ? turnOffFailPoint(ctx.db, ctx.failPointName) : {}))
              .then(() => ctx.client.close())
              .then(() => (ctx = {}));
          });

          suite.tests.forEach(test => {
            it(test.description, function () {
              // Step 1: Test Setup. Includes a lot of boilerplate stuff
              // like creating a client, dropping and refilling data collections,
              // and enabling failpoints
              return executeScenarioSetup(suite, test, this.configuration, ctx).then(() =>
                // Step 2: Run the test
                executeScenarioTest(test, ctx)
              );
            });
          });
        }
      });
    });
  });
});

function executeScenarioSetup(scenario, test, config, ctx) {
  const url = config.url();
  const options = Object.assign({}, test.clientOptions, {
    haInterval: 100,
    heartbeatFrequencyMS: 100,
    monitorCommands: true,
    minSize: 10
  });

  ctx.failPointName = test.failPoint && test.failPoint.configureFailPoint;

  const client = config.newClient(url, options);
  return client
    .connect()
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
    .then(() =>
      Array.isArray(scenario.data) && scenario.data.length
        ? ctx.collection.insertMany(scenario.data)
        : {}
    )
    .then(() => (test.failPoint ? ctx.db.executeDbAdminCommand(test.failPoint) : {}));
}

function executeScenarioTest(test, ctx) {
  return Promise.resolve()
    .then(() => {
      const args = generateArguments(test);

      let result = ctx.collection[test.operation.name].apply(ctx.collection, args);
      const hasResult =
        test.outcome.result &&
        !test.outcome.result.errorLabelsContain &&
        !test.outcome.result.errorLabelsOmit;
      if (test.outcome.error) {
        result = result
          .then(() => expect(false).to.be.true)
          .catch(err => {
            expect(err).to.exist;
            expect(err.message, 'expected operations to fail, but they succeeded').to.not.match(
              /expected false to be true/
            );
            if (hasResult) {
              expect(err.result).to.matchMongoSpec(test.outcome.result);
            }
            const errorLabelsContain =
              test.outcome && test.outcome.result && test.outcome.result.errorLabelsContain;
            const errorLabelsOmit =
              test.outcome && test.outcome.result && test.outcome.result.errorLabelsOmit;
            if (errorLabelsContain) expect(err.errorLabels).to.have.members(errorLabelsContain);
            if (errorLabelsOmit) expect(err.errorLabels).to.not.have.members(errorLabelsOmit);
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
 *
 * @param {any} test
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
 *
 * @param {any} op
 */
function convertBulkWriteOperation(op) {
  return { [op.name]: op.arguments };
}

/**
 * Transforms output of a bulk write to conform to the test format
 *
 * @param {any} result
 */
function transformToResultValue(result) {
  return result && result.value ? result.value : result;
}

/**
 * Transforms expected values from the proper test format to
 * our (improper) actual output for upsertedId.
 *
 * @param {any} result
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
 *
 * @param {any} db
 * @param {any} name
 */
function turnOffFailPoint(db, name) {
  return db.executeDbAdminCommand({
    configureFailPoint: name,
    mode: 'off'
  });
}
