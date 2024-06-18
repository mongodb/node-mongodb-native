import { expect } from 'chai';
import * as path from 'path';

import type { Collection, Db, MongoClient } from '../../mongodb';
import { loadSpecTests } from '../../spec';
import { legacyRunOnToRunOnRequirement } from '../../tools/spec-runner';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';
import { isAnyRequirementSatisfied } from '../../tools/unified-spec-runner/unified-utils';

interface RetryableWriteTestContext {
  client?: MongoClient;
  db?: Db;
  collection?: Collection;
  failPointName?: any;
}

describe('Legacy Retryable Writes Specs', function () {
  let ctx: RetryableWriteTestContext = {};

  const retryableWrites = loadSpecTests('retryable-writes', 'legacy');

  for (const suite of retryableWrites) {
    describe(suite.name, function () {
      beforeEach(async function () {
        let utilClient: MongoClient;
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

      beforeEach(async function () {
        // Step 1: Test Setup. Includes a lot of boilerplate stuff
        // like creating a client, dropping and refilling data collections,
        // and enabling failpoints
        const { spec } = this.currentTest;
        await executeScenarioSetup(suite, spec, this.configuration, ctx);
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

      for (const spec of suite.tests) {
        // Step 2: Run the test
        const mochaTest = it(spec.description, async () => await executeScenarioTest(spec, ctx));

        // A pattern we don't need to repeat for unified tests
        // In order to give the beforeEach hook access to the
        // spec test so it can be responsible for skipping it
        // and executeScenarioSetup
        mochaTest.spec = spec;
      }
    });
  }
});

async function executeScenarioSetup(scenario, test, config, ctx) {
  const url = config.url();
  const options = {
    ...test.clientOptions,
    heartbeatFrequencyMS: 100,
    monitorCommands: true,
    minPoolSize: 10
  };

  ctx.failPointName = test.failPoint && test.failPoint.configureFailPoint;

  const client = config.newClient(url, options);
  await client.connect();

  ctx.client = client;
  ctx.db = client.db(config.db);
  ctx.collection = ctx.db.collection(`retryable_writes_test_${config.name}_${test.operation.name}`);

  try {
    await ctx.collection.drop();
  } catch (error) {
    if (!error.message.match(/ns not found/)) {
      throw error;
    }
  }

  if (Array.isArray(scenario.data) && scenario.data.length) {
    await ctx.collection.insertMany(scenario.data);
  }

  if (test.failPoint) {
    await ctx.client.db('admin').command(test.failPoint);
  }
}

async function executeScenarioTest(test, ctx: RetryableWriteTestContext) {
  const args = generateArguments(test);

  // In case the spec files or our API changes
  expect(ctx.collection).to.have.property(test.operation.name).that.is.a('function');

  // TODO(NODE-4033): Collect command started events and assert txn number existence or omission
  // have to add logic to handle bulkWrites which emit multiple command started events
  const resultOrError = await ctx.collection[test.operation.name](...args).catch(error => error);

  const outcome = test.outcome && test.outcome.result;
  const errorLabelsContain = outcome && outcome.errorLabelsContain;
  const errorLabelsOmit = outcome && outcome.errorLabelsOmit;
  const hasResult = outcome && !errorLabelsContain && !errorLabelsOmit;
  if (test.outcome.error) {
    const thrownError = resultOrError;
    expect(thrownError, `${test.operation.name} was supposed to fail but did not!`).to.exist;
    expect(thrownError).to.have.property('message');

    if (hasResult) {
      expect(thrownError.result).to.matchMongoSpec(test.outcome.result);
    }

    if (errorLabelsContain) {
      expect(thrownError.errorLabels).to.include.members(errorLabelsContain);
    }

    if (errorLabelsOmit) {
      for (const label of errorLabelsOmit) {
        expect(thrownError.errorLabels).to.not.contain(label);
      }
    }
  } else if (test.outcome.result) {
    expect(resultOrError, resultOrError.stack).to.not.be.instanceOf(Error);
    const result = resultOrError;
    const expected = test.outcome.result;

    const actual = result.value ?? result;
    // Some of our result classes contain the optional 'acknowledged' property which is
    // not part of the test expectations.
    for (const property in expected) {
      expect(actual).to.have.deep.property(property, expected[property]);
    }
  }

  if (test.outcome.collection) {
    const collectionResults = await ctx.collection.find({}).toArray();
    expect(collectionResults).to.deep.equal(test.outcome.collection.data);
  }
}

// Helper Functions

/** Transforms the arguments from a test into actual arguments for our function calls */
function generateArguments(test) {
  const args = [];

  if (test.operation.arguments) {
    const options: Record<string, any> = {};
    for (const arg of Object.keys(test.operation.arguments)) {
      if (arg === 'requests') {
        /** Transforms a request arg into a bulk write operation */
        args.push(
          test.operation.arguments[arg].map(({ name, arguments: args }) => ({ [name]: args }))
        );
      } else if (arg === 'upsert') {
        options.upsert = test.operation.arguments[arg];
      } else if (arg === 'returnDocument') {
        options.returnDocument = test.operation.arguments[arg].toLowerCase();
      } else {
        args.push(test.operation.arguments[arg]);
      }
    }

    if (Object.keys(options).length > 0) {
      args.push(options);
    }
  }

  return args;
}

/** Runs a command that turns off a fail point */
async function turnOffFailPoint(client, name) {
  return await client.db('admin').command({
    configureFailPoint: name,
    mode: 'off'
  });
}

describe.only('Retryable Writes (unified)', function () {
  runUnifiedSuite(loadSpecTests(path.join('retryable-writes', 'unified')));
});
