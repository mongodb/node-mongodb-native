import { expect } from 'chai';
import { ReadPreference } from '../../../src/read_preference';
import { loadSpecTests } from '../../spec/index';
import * as uni from './schema';
import { getUnmetRequirements, matchesEvents, patchVersion, zip, log } from './unified-utils';
import { EntitiesMap } from './entities';
import { ns } from '../../../src/utils';
import { executeOperationAndCheck } from './operations';
import { MongoError } from '../../../src';
import { satisfies as semverSatisfies } from 'semver';

export type TestConfiguration = InstanceType<
  typeof import('../../tools/runner/config')['TestConfiguration']
>;
interface MongoDBMochaTestContext extends Mocha.Context {
  configuration: TestConfiguration;
}

async function runOne(
  ctx: MongoDBMochaTestContext,
  unifiedSuite: uni.UnifiedSuite,
  test: uni.Test
) {
  // Some basic expectations we can catch early
  expect(test).to.exist;
  expect(unifiedSuite).to.exist;
  expect(ctx).to.exist;
  expect(ctx.configuration).to.exist;

  // If test.skipReason is specified, the test runner MUST skip this
  // test and MAY use the string value to log a message.
  if (test.skipReason) {
    console.warn(`Skipping test ${test.description}: ${test.skipReason}.`);
    ctx.skip();
  }

  const UTIL_CLIENT = ctx.configuration.newClient();
  await UTIL_CLIENT.connect();
  ctx.defer(async () => await UTIL_CLIENT.close());

  // If test.runOnRequirements is specified, the test runner MUST skip the test unless one or more
  // runOnRequirement objects are satisfied.
  if (test.runOnRequirements) {
    if (!test.runOnRequirements.some(r => getUnmetRequirements(ctx.configuration, r))) {
      ctx.skip();
    }
  }

  // If initialData is specified, for each collectionData therein the test runner MUST drop the
  // collection and insert the specified documents (if any) using a "majority" write concern. If no
  // documents are specified, the test runner MUST create the collection with a "majority" write concern.
  // The test runner MUST use the internal MongoClient for these operations.
  if (unifiedSuite.initialData) {
    for (const collData of unifiedSuite.initialData) {
      const db = UTIL_CLIENT.db(collData.databaseName);
      const collection = db.collection(collData.collectionName, {
        writeConcern: { w: 'majority' }
      });
      try {
        expect(await collection.drop()).to.be.true;
      } catch (error) {
        // fresh run of the tests maybe?
        expect(error).to.be.instanceof(MongoError);
        expect(error.code).to.equal(26); // ns not found
      }

      if (collData.documents.length === 0) {
        await db.createCollection(collData.collectionName, {
          writeConcern: { w: 'majority' }
        });
        continue;
      }

      await collection.insertMany(collData.documents);
    }
  }

  const entities = await EntitiesMap.createEntities(ctx.configuration, unifiedSuite.createEntities);
  ctx.defer(async () => await entities.cleanup());

  // Workaround for SERVER-39704:
  // a test runners MUST execute a non-transactional distinct command on
  // each mongos server before running any test that might execute distinct within a transaction.
  // To ease the implementation, test runners MAY execute distinct before every test.
  if (
    ctx.topologyType === uni.TopologyType.sharded ||
    ctx.topologyType === uni.TopologyType.shardedReplicaset
  ) {
    for (const [, collection] of entities.collections()) {
      await UTIL_CLIENT.db(ns(collection.namespace).db).command({
        distinct: collection.collectionName,
        key: '_id'
      });
    }
  }

  for (const operation of test.operations) {
    await executeOperationAndCheck(operation, entities);
  }

  const clientEvents = new Map();
  // If any event listeners were enabled on any client entities,
  // the test runner MUST now disable those event listeners.
  for (const [id, client] of entities.clients()) {
    clientEvents.set(id, client.stopCapturingEvents());
  }

  if (test.expectEvents) {
    for (const expectedEventList of test.expectEvents) {
      const clientId = expectedEventList.client;
      const actualEvents = clientEvents.get(clientId);

      expect(actualEvents, `No client entity found with id ${clientId}`).to.exist;
      matchesEvents(expectedEventList.events, actualEvents);
    }
  }

  if (test.outcome) {
    for (const collectionData of test.outcome) {
      const collection = UTIL_CLIENT.db(collectionData.databaseName).collection(
        collectionData.collectionName
      );
      const findOpts = {
        readConcern: 'local' as const,
        readPreference: ReadPreference.primary,
        sort: { _id: 'asc' as const }
      };
      const documents = await collection.find({}, findOpts).toArray();

      expect(documents).to.have.lengthOf(collectionData.documents.length);
      for (const [expected, actual] of zip(collectionData.documents, documents)) {
        expect(actual).to.include(expected, 'Test outcome did not match expected');
      }
    }
  }
}

describe('Unified test format', function unifiedTestRunner() {
  // Valid tests that should pass
  for (const unifiedSuite of loadSpecTests('unified-test-format/valid-pass')) {
    const schemaVersion = patchVersion(unifiedSuite.schemaVersion);
    expect(semverSatisfies(schemaVersion, uni.SupportedVersion)).to.be.true;
    context(String(unifiedSuite.description), function runUnifiedTest() {
      for (const test of unifiedSuite.tests) {
        it(String(test.description), async function runOneUnifiedTest() {
          // Function call for indentation sake...
          try {
            await runOne(this as MongoDBMochaTestContext, unifiedSuite, test);
          } catch (error) {
            if (error.message.includes('not implemented.')) {
              log(`${test.description}: was skipped due to missing functionality`);
              this.skip();
            } else {
              throw error;
            }
          }
        });
      }
    });
  }

  // Valid tests that should fail
  // for (const unifiedSuite of loadSpecTests('unified-test-format/valid-fail')) {
  //   // TODO
  // }

  // Tests that are invalid, would be good to gracefully fail on
  // for (const unifiedSuite of loadSpecTests('unified-test-format/invalid')) {
  //   // TODO
  // }
});
