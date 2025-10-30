/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { AssertionError, expect } from 'chai';
import { gte as semverGte, satisfies as semverSatisfies } from 'semver';

import {
  type MongoClient,
  MongoParseError,
  MongoServerError,
  ReadPreference,
  TopologyType
} from '../../../src';
import { MONGODB_ERROR_CODES } from '../../../src/error';
import { ns } from '../../../src/utils';
import { ejson } from '../utils';
import { AstrolabeResultsWriter } from './astrolabe_results_writer';
import { EntitiesMap, type UnifiedMongoClient } from './entities';
import { compareLogs, filterIgnoredMessages, matchesEvents } from './match';
import { executeOperationAndCheck } from './operations';
import * as uni from './schema';
import { isAnyRequirementSatisfied, patchVersion, zip } from './unified-utils';

export function trace(message: string): void {
  if (process.env.UTR_TRACE) {
    console.error(` > ${message}`);
  }
}

async function isAtlasDataLake(client: MongoClient): Promise<boolean> {
  const buildInfo = await client.db('admin').admin().buildInfo();
  return 'dataLake' in buildInfo;
}

async function terminateOpenTransactions(client: MongoClient) {
  // killAllSessions is not allowed in ADL.
  if (await isAtlasDataLake(client)) {
    return;
  }
  // TODO(NODE-3491): on sharded clusters this has to be run on each mongos
  try {
    await client.db().admin().command({ killAllSessions: [] });
  } catch (err) {
    if (err.code === 11601 || err.code === 13 || err.code === 59) {
      return;
    }

    throw err;
  }
}

/*
 * @param skipFilter - a function that returns null if the test should be run,
 *                     or a skip reason if the test should be skipped
 */
async function runUnifiedTest(
  ctx: Mocha.Context,
  unifiedSuite: uni.UnifiedSuite,
  test: uni.Test,
  skipFilter: uni.TestFilter = () => false
): Promise<void> {
  // Some basic expectations we can catch early
  expect(test).to.exist;
  expect(unifiedSuite).to.exist;
  expect(ctx).to.exist;
  expect(ctx.configuration).to.exist;

  expect(ctx.test, 'encountered a unified test where the test is undefined').to.exist;
  expect(ctx.currentTest, '`runUnifiedTest` can only be used inside of it blocks').to.be.undefined;

  const schemaVersion = patchVersion(unifiedSuite.schemaVersion);
  expect(semverSatisfies(schemaVersion, uni.SupportedVersion)).to.be.true;

  const skipReason = test.skipReason ?? skipFilter(test, ctx.configuration);

  if (typeof skipReason === 'string') {
    if (skipReason.length === 0) {
      expect.fail(`Test was skipped with an empty skip reason: ${test.description}`);
    }

    ctx.test!.skipReason = skipReason;

    ctx.skip();
  }

  let utilClient: MongoClient;
  if (ctx.configuration.isLoadBalanced) {
    // The util client can always point at the single mongos LB frontend.
    utilClient = ctx.configuration.newClient(ctx.configuration.singleMongosLoadBalancerUri);
  } else if (process.env.UTIL_CLIENT_USER && process.env.UTIL_CLIENT_PASSWORD) {
    // For OIDC tests the MONGODB_URI is the base admin URI that the util client will use.
    utilClient = ctx.configuration.newClient(process.env.MONGODB_URI, {
      auth: {
        username: process.env.UTIL_CLIENT_USER,
        password: process.env.UTIL_CLIENT_PASSWORD
      }
    });
  } else {
    utilClient = ctx.configuration.newClient();
  }

  let entities: EntitiesMap | undefined;
  try {
    trace('\n starting test:');
    try {
      await utilClient.connect();
    } catch (error) {
      console.error(
        ejson`failed to connect utilClient ${utilClient.s.url} - ${utilClient.options}`
      );
      throw error;
    }

    // terminate all sessions before each test suite
    await terminateOpenTransactions(utilClient);

    // Must fetch parameters before checking runOnRequirements
    ctx.configuration.parameters = (await isAtlasDataLake(utilClient))
      ? {}
      : await utilClient.db().admin().command({ getParameter: '*' });

    // If test.runOnRequirements is specified, the test runner MUST skip the test unless one or more
    // runOnRequirement objects are satisfied.
    const suiteRequirements = unifiedSuite.runOnRequirements ?? [];
    const testRequirements = test.runOnRequirements ?? [];

    trace('satisfiesRequirements');
    const isSomeSuiteRequirementMet =
      !suiteRequirements.length ||
      (await isAnyRequirementSatisfied(ctx, suiteRequirements, utilClient));
    const isSomeTestRequirementMet =
      isSomeSuiteRequirementMet &&
      (!testRequirements.length ||
        (await isAnyRequirementSatisfied(ctx, testRequirements, utilClient)));

    if (!isSomeTestRequirementMet) {
      return ctx.skip();
    }

    // If initialData is specified, for each collectionData therein the test runner MUST drop the
    // collection and insert the specified documents (if any) using a "majority" write concern. If no
    // documents are specified, the test runner MUST create the collection with a "majority" write concern.
    // The test runner MUST use the internal MongoClient for these operations.
    if (unifiedSuite.initialData) {
      trace('initialData');
      for (const { databaseName, collectionName } of unifiedSuite.initialData) {
        const db = utilClient.db(databaseName);

        trace('listCollections');
        const allCollections = new Set(
          await db
            .listCollections()
            .map(({ name }) => name)
            .toArray()
        );

        const collections = [
          collectionName,
          `enxcol_.${collectionName}.esc`,
          `enxcol_.${collectionName}.ecoc`
        ].filter(allCollections.has.bind(allCollections));

        for (const name of collections) {
          const collection = db.collection(name, {
            writeConcern: { w: 'majority' }
          });

          trace('drop');
          expect(await collection.drop()).to.be.true;
        }
      }

      for (const {
        databaseName,
        collectionName,
        createOptions,
        documents = []
      } of unifiedSuite.initialData) {
        const db = utilClient.db(databaseName);
        const collection = db.collection(collectionName, {
          writeConcern: { w: 'majority' }
        });

        if (createOptions || !documents.length) {
          trace('createCollection');
          const options = createOptions ?? {};
          await db.createCollection(collectionName, {
            ...options,
            writeConcern: { w: 'majority' }
          });
        }

        if (documents.length > 0) {
          trace('insertMany');
          await collection.insertMany(documents);
        }
      }
    }

    const ping = await utilClient.db().admin().command({ ping: 1 });
    const clusterTime = ping.$clusterTime;

    trace('createEntities');
    entities = await EntitiesMap.createEntities(
      ctx.configuration,
      clusterTime,
      unifiedSuite.createEntities
    );

    // Workaround for SERVER-39704:
    // test runners MUST execute a non-transactional distinct command on
    // each mongos server before running any test that might execute distinct within a transaction.
    // To ease the implementation, test runners MAY execute distinct before every test.
    const topologyType = ctx.configuration.topologyType;
    if (topologyType === TopologyType.Sharded || topologyType === TopologyType.LoadBalanced) {
      for (const [, collection] of entities.mapOf('collection')) {
        try {
          await utilClient.db(ns(collection.namespace).db).command({
            distinct: collection.collectionName,
            key: '_id'
          });
        } catch (err) {
          // https://jira.mongodb.org/browse/SERVER-60533
          // distinct throws namespace not found errors on servers 5.2.2 and under.
          // For now, we skip these errors to be addressed in NODE-4238.
          if (err.code !== MONGODB_ERROR_CODES.NamespaceNotFound) {
            throw err;
          }
          const serverVersion = ctx.configuration.version;
          if (semverGte(serverVersion, '5.2.2')) {
            throw err;
          }
        }
      }
    }

    for (const operation of test.operations) {
      trace(operation.name);
      try {
        await executeOperationAndCheck(operation, entities, utilClient, ctx.configuration);
      } catch (e) {
        // clean up all sessions on failed test, and rethrow
        await terminateOpenTransactions(utilClient);
        throw e;
      }
    }

    const clientList = new Map<string, UnifiedMongoClient>();
    // If any event listeners were enabled on any client entities,
    // the test runner MUST now disable those event listeners.
    for (const [id, client] of entities.mapOf('client')) {
      client.stopCapturingEvents();
      clientList.set(id, client);
    }

    if (test.expectEvents) {
      for (const expectedEventsForClient of test.expectEvents) {
        const clientId = expectedEventsForClient.client;
        const eventType = expectedEventsForClient.eventType;
        // If no event type is provided it defaults to 'command', so just
        // check for 'cmap' here for now.
        const testClient = clientList.get(clientId);
        expect(testClient, `No client entity found with id ${clientId}`).to.exist;
        matchesEvents(
          expectedEventsForClient,
          testClient!.getCapturedEvents(eventType ?? 'command'),
          entities
        );
      }
    }

    if (test.expectLogMessages) {
      for (const expectedLogsForClient of test.expectLogMessages) {
        const clientId = expectedLogsForClient.client;
        const testClient = clientList.get(clientId);

        expect(testClient, `No client entity found with id ${clientId}`).to.exist;
        const filteredTestClientLogs = expectedLogsForClient.ignoreMessages
          ? filterIgnoredMessages(
              expectedLogsForClient.ignoreMessages,
              testClient!.collectedLogs,
              entities
            )
          : testClient!.collectedLogs;
        compareLogs(
          expectedLogsForClient.messages,
          filteredTestClientLogs,
          entities,
          expectedLogsForClient.ignoreExtraMessages
        );
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
    // For astrolabe testing we need to write the entities to files.
    if (process.env.WORKLOAD_SPECIFICATION) {
      const writer = new AstrolabeResultsWriter(entities!);
      await writer.write();
    }
    await entities?.cleanup();
  }
}

/**
 *
 * @param skipFilter - a function that returns null if the test should be run,
 *                     or a skip reason if the test should be skipped
 */
export function runUnifiedSuite(
  specTests: uni.UnifiedSuite[],
  skipFilter: uni.TestFilter = () => false,
  expectRuntimeError = false
): void {
  for (const unifiedSuite of specTests) {
    context(String(unifiedSuite.description), function () {
      for (const [index, test] of unifiedSuite.tests.entries()) {
        it(String(test.description === '' ? `Test ${index}` : test.description), async function () {
          if (expectRuntimeError) {
            const error = await runUnifiedTest(this, unifiedSuite, test, skipFilter).catch(
              error => error
            );
            expect(error).to.satisfy(value => {
              return (
                value instanceof AssertionError ||
                value instanceof MongoServerError ||
                value instanceof TypeError ||
                value instanceof MongoParseError
              );
            });
          } else {
            await runUnifiedTest(this, unifiedSuite, test, skipFilter);
          }
        });
      }
    });
  }
}
