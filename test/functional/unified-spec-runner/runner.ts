import { expect } from 'chai';
import { ReadPreference } from '../../../src/read_preference';
import * as uni from './schema';
import { zip, topologySatisfies, patchVersion } from './unified-utils';
import { CommandEvent, EntitiesMap } from './entities';
import { ns } from '../../../src/utils';
import { executeOperationAndCheck } from './operations';
import { matchesEvents } from './match';
import { satisfies as semverSatisfies } from 'semver';

export type TestConfiguration = InstanceType<
  typeof import('../../tools/runner/config')['TestConfiguration']
>;
interface MongoDBMochaTestContext extends Mocha.Context {
  configuration: TestConfiguration;
}

const SKIPPED_TESTS = [
  // These were already skipped in our existing spec tests
  'unpin after transient error within a transaction and commit',
  'Dirty explicit session is discarded',

  // TODO Un-skip these to complete unified runner
  'withTransaction inherits transaction options from client',
  'withTransaction inherits transaction options from defaultTransactionOptions',
  'remain pinned after non-transient Interrupted error on insertOne',
  'unpin after transient error within a transaction',
  'Client side error in command starting transaction',
  'explicitly create collection using create command',
  'create index on a non-existing collection',
  'InsertMany succeeds after PrimarySteppedDown',
  'withTransaction and no transaction options set',
  'withTransaction explicit transaction options',
  'InsertOne fails after connection failure when retryWrites option is false',
  'InsertOne fails after multiple retryable writeConcernErrors'
];

export async function runUnifiedTest(
  ctx: MongoDBMochaTestContext,
  unifiedSuite: uni.UnifiedSuite,
  test: uni.Test
): Promise<void> {
  // Some basic expectations we can catch early
  expect(test).to.exist;
  expect(unifiedSuite).to.exist;
  expect(ctx).to.exist;
  expect(ctx.configuration).to.exist;

  const schemaVersion = patchVersion(unifiedSuite.schemaVersion);
  expect(semverSatisfies(schemaVersion, uni.SupportedVersion)).to.be.true;

  // If test.skipReason is specified, the test runner MUST skip this
  // test and MAY use the string value to log a message.
  if (test.skipReason) {
    console.warn(`Skipping test ${test.description}: ${test.skipReason}.`);
    ctx.skip();
  }

  if (SKIPPED_TESTS.includes(test.description)) {
    ctx.skip();
  }

  const utilClient = ctx.configuration.newClient();

  let entities;
  try {
    await utilClient.connect();

    // Must fetch parameters before checking runOnRequirements
    ctx.configuration.parameters = await utilClient.db().admin().command({ getParameter: '*' });

    // If test.runOnRequirements is specified, the test runner MUST skip the test unless one or more
    // runOnRequirement objects are satisfied.
    const allRequirements = [
      ...(unifiedSuite.runOnRequirements ?? []),
      ...(test.runOnRequirements ?? [])
    ];

    let doesNotMeetRunOnRequirement = allRequirements.length > 0;

    for (const requirement of allRequirements) {
      if (await topologySatisfies(ctx.configuration, requirement, utilClient)) {
        doesNotMeetRunOnRequirement = false; // it does meet a run on requirement!
        break;
      }
    }

    if (doesNotMeetRunOnRequirement) {
      ctx.skip();
    }

    // If initialData is specified, for each collectionData therein the test runner MUST drop the
    // collection and insert the specified documents (if any) using a "majority" write concern. If no
    // documents are specified, the test runner MUST create the collection with a "majority" write concern.
    // The test runner MUST use the internal MongoClient for these operations.
    if (unifiedSuite.initialData) {
      for (const collData of unifiedSuite.initialData) {
        const db = utilClient.db(collData.databaseName);
        const collection = db.collection(collData.collectionName, {
          writeConcern: { w: 'majority' }
        });
        const collectionList = await db
          .listCollections({ name: collData.collectionName })
          .toArray();
        if (collectionList.length !== 0) {
          expect(await collection.drop()).to.be.true;
        }
      }

      for (const collData of unifiedSuite.initialData) {
        const db = utilClient.db(collData.databaseName);
        const collection = db.collection(collData.collectionName, {
          writeConcern: { w: 'majority' }
        });

        if (!collData.documents?.length) {
          await db.createCollection(collData.collectionName, {
            writeConcern: { w: 'majority' }
          });
          continue;
        }

        await collection.insertMany(collData.documents);
      }
    }

    entities = await EntitiesMap.createEntities(ctx.configuration, unifiedSuite.createEntities);

    // Workaround for SERVER-39704:
    // test runners MUST execute a non-transactional distinct command on
    // each mongos server before running any test that might execute distinct within a transaction.
    // To ease the implementation, test runners MAY execute distinct before every test.
    if (
      ctx.topologyType === uni.TopologyType.sharded ||
      ctx.topologyType === uni.TopologyType.shardedReplicaset
    ) {
      for (const [, collection] of entities.mapOf('collection')) {
        await utilClient.db(ns(collection.namespace).db).command({
          distinct: collection.collectionName,
          key: '_id'
        });
      }
    }

    for (const operation of test.operations) {
      await executeOperationAndCheck(operation, entities, utilClient);
    }

    const clientEvents = new Map<string, CommandEvent[]>();
    // If any event listeners were enabled on any client entities,
    // the test runner MUST now disable those event listeners.
    for (const [id, client] of entities.mapOf('client')) {
      clientEvents.set(id, client.stopCapturingEvents());
    }

    if (test.expectEvents) {
      for (const expectedEventList of test.expectEvents) {
        const clientId = expectedEventList.client;
        const actualEvents = clientEvents.get(clientId);

        expect(actualEvents, `No client entity found with id ${clientId}`).to.exist;
        matchesEvents(expectedEventList.events, actualEvents, entities);
      }
    }

    if (test.outcome) {
      for (const collectionData of test.outcome) {
        const collection = utilClient
          .db(collectionData.databaseName)
          .collection(collectionData.collectionName);
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
  } finally {
    await utilClient.close();
    await entities?.cleanup();
  }
}

export function runUnifiedSuite(specTests: uni.UnifiedSuite[]): void {
  for (const unifiedSuite of specTests) {
    context(String(unifiedSuite.description), function () {
      for (const test of unifiedSuite.tests) {
        it(String(test.description), {
          metadata: { sessions: { skipLeakTests: true } },
          test: async function () {
            await runUnifiedTest(this, unifiedSuite, test);
          }
        });
      }
    });
  }
}
