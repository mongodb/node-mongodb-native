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

// Load balancer fronting 1 mongos.
const SINGLE_MONGOS_LB_URI = process.env.SINGLE_MONGOS_LB_URI;
// Load balancer fronting 2 mongoses.
const MULTI_MONGOS_LB_URI = process.env.MULTI_MONGOS_LB_URI;

export async function runUnifiedTest(
  ctx: MongoDBMochaTestContext,
  unifiedSuite: uni.UnifiedSuite,
  test: uni.Test,
  testsToSkip?: string[]
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

  if (testsToSkip?.includes(test.description)) {
    ctx.skip();
  }

  let utilClient;
  if (ctx.topologyType === uni.TopologyType.loadBalanced) {
    // In load balanced mode we require these 2 environment
    // variables to be set pointing at the load balancer
    // frontends.
    expect(SINGLE_MONGOS_LB_URI).to.exist;
    expect(MULTI_MONGOS_LB_URI).to.exist;

    // We determine which URI the load balancer to point at
    // by looking at the MONGODB_URI - if it has 1 mongos
    // then it's the single mongos frontend and if it has
    // multiple mongoses then we use the multi mongos
    // frontend.
    if (isMultiHostUri(process.env.MONGODB_URI)) {
      utilClient = ctx.configuration.newClient(MULTI_MONGOS_LB_URI);
    } else {
      utilClient = ctx.configuration.newClient(SINGLE_MONGOS_LB_URI);
    }
  } else {
    utilClient = ctx.configuration.newClient();
  }

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

    for (const requirement of allRequirements) {
      const met = await topologySatisfies(ctx.configuration, requirement, utilClient);
      if (!met) {
        return ctx.skip();
      }
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
      ctx.topologyType === uni.TopologyType.shardedReplicaset ||
      ctx.topologyType === uni.TopologyType.loadBalanced
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
          expect(actual).to.deep.include(expected);
        }
      }
    }
  } finally {
    await utilClient.close();
    await entities?.cleanup();
  }
}

export function runUnifiedSuite(specTests: uni.UnifiedSuite[], testsToSkip?: string[]): void {
  for (const unifiedSuite of specTests) {
    context(String(unifiedSuite.description), function () {
      for (const test of unifiedSuite.tests) {
        it(String(test.description), {
          metadata: { sessions: { skipLeakTests: true } },
          test: async function () {
            await runUnifiedTest(this, unifiedSuite, test, testsToSkip);
          }
        });
      }
    });
  }
}

/**
 * Determine if the URI is multi-host. Our test suites
 * use simple user/password combinations so we take the
 * simple route here and just look for commas between the
 * scheme and db.
 */
function isMultiHostUri(uri: string): boolean {
  const plainUri = uri.substring(str.lastIndexOf('://') + 1, str.lastIndexOf('/'));
  return plainUri.includes(',');
}
