'use strict';

const path = require('path');
const { expect } = require('chai');
const { loadSpecTests } = require('../../spec');
const { legacyRunOnToRunOnRequirement } = require('../../tools/spec-runner');
const { runUnifiedSuite } = require('../../tools/unified-spec-runner/runner');
const { isAnyRequirementSatisfied } = require('../../tools/unified-spec-runner/unified-utils');

describe('Legacy Retryable Writes specs', function () {
  let ctx = {};
  const retryableWrites = loadSpecTests(path.join('retryable-writes', 'legacy'));

  for (const suite of retryableWrites) {
    describe(suite.name, function () {
      beforeEach(async function () {
        let utilClient;
        if (this.configuration.isLoadBalanced) {
          // The util client can always point at the single mongos LB frontend.
          utilClient = this.configuration.newClient(this.configuration.singleMongosLoadBalancerUri);
        } else {
          utilClient = this.configuration.newClient();
        }

        await utilClient.connect();

        const allRequirements = suite.runOn.map(legacyRunOnToRunOnRequirement);

        const someRequirementMet =
          !allRequirements.length ||
          (await isAnyRequirementSatisfied(this.currentTest.ctx, allRequirements, utilClient));

        await utilClient.close();

        if (!someRequirementMet) this.skip();
      });

      afterEach(async function () {
        // Step 3: Test Teardown. Turn off failpoints, and close client
        if (!ctx.db || !ctx.client) {
          return;
        }

        if (ctx.failPointName) {
          await turnOffFailPoint(ctx.client, ctx.failPointName);
        }
        await ctx.client.close();
        ctx = {}; // reset context
      });

      for (const test of suite.tests) {
        it(test.description, async function () {
          // Step 1: Test Setup. Includes a lot of boilerplate stuff
          // like creating a client, dropping and refilling data collections,
          // and enabling failpoints
          await executeScenarioSetup(suite, test, this.configuration, ctx);
          // Step 2: Run the test
          await executeScenarioTest(test, ctx);
        });
      }
    });
  }
});

function executeScenarioSetup(scenario, test, config, ctx) {
  const url = config.url();
  const options = Object.assign({}, test.clientOptions, {
    heartbeatFrequencyMS: 100,
    monitorCommands: true,
    minPoolSize: 10
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
    .then(() => (test.failPoint ? ctx.client.db('admin').command(test.failPoint) : {}));
}

function executeScenarioTest(test, ctx) {
  return Promise.resolve()
    .then(() => {
      const args = generateArguments(test);

      let result = ctx.collection[test.operation.name].apply(ctx.collection, args);
      const outcome = test.outcome && test.outcome.result;
      const errorLabelsContain = outcome && outcome.errorLabelsContain;
      const errorLabelsOmit = outcome && outcome.errorLabelsOmit;
      const hasResult = outcome && !errorLabelsContain && !errorLabelsOmit;
      if (test.outcome.error) {
        result = result
          .then(() => expect(false).to.be.true)
          .catch(err => {
            expect(err).to.exist;
            expect(err.message, 'expected operations to fail, but they succeeded').to.not.match(
              /expected false to be true/
            );
            if (hasResult) expect(err.result).to.matchMongoSpec(test.outcome.result);
            if (errorLabelsContain) expect(err.errorLabels).to.include.members(errorLabelsContain);
            if (errorLabelsOmit) {
              errorLabelsOmit.forEach(label => {
                expect(err.errorLabels).to.not.contain(label);
              });
            }
          });
      } else if (test.outcome.result) {
        const expected = test.outcome.result;
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
        options.returnDocument = test.operation.arguments[arg].toLowerCase();
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

/** Runs a command that turns off a fail point */
function turnOffFailPoint(client, name) {
  return client.db('admin').command({
    configureFailPoint: name,
    mode: 'off'
  });
}

// These tests are skipped because the driver 1) executes a ping when connecting to
// an authenticated server and 2) command monitoring is at the connection level so
// when the handshake fails no command started event is emitted.
const SKIP = [
  'InsertOne succeeds after retryable handshake error',
  'InsertOne succeeds after retryable handshake error ShutdownInProgress'
];

describe('Retryable Writes (unified)', function () {
  runUnifiedSuite(loadSpecTests(path.join('retryable-writes', 'unified')), SKIP);
});
