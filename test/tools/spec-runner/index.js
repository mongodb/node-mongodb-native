'use strict';
const path = require('path');
const fs = require('fs');
const chai = require('chai');

const expect = chai.expect;
const { EJSON } = require('bson');
const { isRecord } = require('../../mongodb');
const TestRunnerContext = require('./context').TestRunnerContext;
const resolveConnectionString = require('./utils').resolveConnectionString;
const {
  LEGACY_HELLO_COMMAND,
  CMAP_EVENTS: SOURCE_CMAP_EVENTS,
  TOPOLOGY_EVENTS,
  HEARTBEAT_EVENTS
} = require('../../mongodb');
const { isAnyRequirementSatisfied } = require('../unified-spec-runner/unified-utils');
const { ClientSideEncryptionFilter } = require('../runner/filters/client_encryption_filter');
const { getCSFLEKMSProviders } = require('../../csfle-kms-providers');

// Promise.try alternative https://stackoverflow.com/questions/60624081/promise-try-without-bluebird/60624164?noredirect=1#comment107255389_60624164
function promiseTry(callback) {
  return new Promise((resolve, reject) => {
    try {
      resolve(callback());
    } catch (e) {
      reject(e);
    }
  });
}

chai.use(require('chai-subset'));
chai.use(require('./matcher').default);

function escape(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function translateClientOptions(options) {
  Object.keys(options).forEach(key => {
    if (['j', 'journal', 'fsync', 'wtimeout', 'wtimeoutms'].indexOf(key) >= 0) {
      throw new Error(
        `Unhandled write concern key needs to be added to options.writeConcern: ${key}`
      );
    }

    if (key === 'w') {
      options.writeConcern = { w: options.w };
      delete options[key];
    } else if (key === 'readConcernLevel') {
      options.readConcern = { level: options.readConcernLevel };
      delete options[key];
    } else if (key === 'autoEncryptOpts') {
      options.autoEncryption = Object.assign({}, options.autoEncryptOpts);

      if (options.autoEncryptOpts.keyVaultNamespace == null) {
        options.autoEncryption.keyVaultNamespace = 'keyvault.datakeys';
      }

      if (options.autoEncryptOpts.kmsProviders) {
        const kmsProviders = getCSFLEKMSProviders();
        if (options.autoEncryptOpts.kmsProviders.local) {
          kmsProviders.local = options.autoEncryptOpts.kmsProviders.local;
        }

        if (options.autoEncryptOpts.kmsProviders.awsTemporary) {
          kmsProviders.aws = {
            accessKeyId: process.env.CSFLE_AWS_TEMP_ACCESS_KEY_ID,
            secretAccessKey: process.env.CSFLE_AWS_TEMP_SECRET_ACCESS_KEY,
            sessionToken: process.env.CSFLE_AWS_TEMP_SESSION_TOKEN
          };
        }

        if (options.autoEncryptOpts.kmsProviders.awsTemporaryNoSessionToken) {
          kmsProviders.aws = {
            accessKeyId: process.env.CSFLE_AWS_TEMP_ACCESS_KEY_ID,
            secretAccessKey: process.env.CSFLE_AWS_TEMP_SECRET_ACCESS_KEY
          };
        }

        if (options.autoEncryptOpts.kmsProviders.kmip) {
          kmsProviders.kmip = {
            endpoint: 'localhost:5698'
          };
          options.autoEncryption.tlsOptions = {
            kmip: {
              tlsCAFile: process.env.CSFLE_TLS_CA_FILE,
              tlsCertificateKeyFile: process.env.CSFLE_TLS_CLIENT_CERT_FILE
            }
          };
        }

        if (options.autoEncryptOpts.kmsProviders['local:name2']) {
          kmsProviders['local:name2'] = options.autoEncryptOpts.kmsProviders['local:name2'];
          options.autoEncryption.tlsOptions = {
            'local:name2': {
              tlsCAFile: process.env.CSFLE_TLS_CA_FILE,
              tlsCertificateKeyFile: process.env.CSFLE_TLS_CLIENT_CERT_FILE
            }
          };
        }

        if (process.env.CRYPT_SHARED_LIB_PATH) {
          options.autoEncryption.extraOptions = {
            cryptSharedLibPath: process.env.CRYPT_SHARED_LIB_PATH
          };
        }

        options.autoEncryption.kmsProviders = kmsProviders;
      }

      delete options.autoEncryptOpts;
    }
  });

  return options;
}

function gatherTestSuites(specPath, context) {
  return fs
    .readdirSync(specPath)
    .filter(x => x.indexOf('.json') !== -1)
    .map(x =>
      Object.assign(
        EJSON.parse(fs.readFileSync(path.join(specPath, x)), {
          relaxed: context ? !context.requiresCSFLE : true
        }),
        {
          name: path.basename(x, '.json')
        }
      )
    );
}

/**
 * Transforms the legacy specification into the unified format specification
 * **NOTE:** Called directly as a .map() callback
 * @param {Record<string, any>} runOn - a legacy runOn specification
 * @returns {import('../unified-spec-runner/schema').RunOnRequirement}
 */
function legacyRunOnToRunOnRequirement(runOn) {
  const runOnRequirement = { ...runOn };

  if (typeof runOn.topology !== 'undefined') {
    runOnRequirement.topologies = runOn.topology;
  }

  if (typeof runOn.authEnabled !== 'undefined') {
    runOnRequirement.auth = runOn.authEnabled;
  }

  return runOnRequirement;
}

/**
 * @param {((test: { description: string }) => true | string)?} filter a function that returns true for any tests that should run, false otherwise.
 */
function generateTopologyTests(testSuites, testContext, filter) {
  for (const testSuite of testSuites) {
    let runOn = testSuite.runOn;
    if (!testSuite.runOn && !Array.isArray(runOn)) {
      throw new Error('no runOn requirement? it should be required');
    }

    const beforeEachFilter = async function () {
      let utilClient;
      if (this.configuration.isLoadBalanced) {
        // The util client can always point at the single mongos LB frontend.
        utilClient = this.configuration.newClient(this.configuration.singleMongosLoadBalancerUri);
      } else {
        utilClient = this.configuration.newClient();
      }

      await utilClient.connect();

      const allRequirements = runOn.map(legacyRunOnToRunOnRequirement);

      const someRequirementMet =
        allRequirements.length === 0 ||
        (await isAnyRequirementSatisfied(this.currentTest.ctx, allRequirements, utilClient));

      let shouldRun = someRequirementMet;

      const { spec } = this.currentTest;

      if (shouldRun && spec.skipReason) {
        this.currentTest.skipReason = spec.skipReason;
        shouldRun = false;
      }

      if (shouldRun && typeof filter === 'function') {
        const result = filter(spec, this.configuration);
        if (typeof result === 'string') {
          this.currentTest.skipReason = result;
          shouldRun = false;
        }
      }

      let csfleFilterError = null;
      if (shouldRun && testContext.requiresCSFLE) {
        const csfleFilter = new ClientSideEncryptionFilter();
        await csfleFilter.initializeFilter(null, {});
        try {
          const filterResult = csfleFilter.filter({
            metadata: { requires: { clientSideEncryption: true } }
          });
          if (typeof filterResult === 'string') {
            shouldRun = false;
            this.currentTest.skipReason = filterResult;
          }
        } catch (err) {
          csfleFilterError = err;
        }
      }

      await utilClient.close();
      if (csfleFilterError) {
        throw csfleFilterError;
      }

      if (!shouldRun) this.skip();
    };

    describe(testSuite.name, function () {
      beforeEach(beforeEachFilter);

      beforeEach(() => prepareDatabaseForSuite(testSuite, testContext));

      afterEach(() => testContext.cleanupAfterSuite());
      for (const spec of testSuite.tests) {
        const mochaTest = it(spec.description, async function () {
          if (spec.failPoint) {
            await testContext.enableFailPoint(spec.failPoint);
          }

          // run the actual test
          await runTestSuiteTest(this.configuration, spec, testContext);

          if (spec.failPoint) {
            await testContext.disableFailPoint(spec.failPoint);
          }

          await validateOutcome(spec, testContext);
        });
        // Make the spec test available to the beforeEach filter
        mochaTest.spec = spec;
      }
    });
  }
}

// Test runner helpers
function prepareDatabaseForSuite(suite, context) {
  context.dbName = suite.database_name || 'spec_db';
  context.collectionName = suite.collection_name || 'spec_collection';

  const db = context.sharedClient.db(context.dbName);

  if (context.skipPrepareDatabase) return Promise.resolve();

  // Note: killAllSession is not supported on serverless, see CLOUDP-84298
  const setupPromise = context.serverless
    ? Promise.resolve()
    : db
        .admin()
        .command({ killAllSessions: [] })
        .catch(err => {
          if (
            err.message.match(/no such (cmd|command)/) ||
            err.message.match(/Failed to kill on some hosts/) ||
            err.code === 11601
          ) {
            return;
          }

          throw err;
        });

  if (context.collectionName == null || context.dbName === 'admin') {
    return setupPromise;
  }

  const coll = db.collection(context.collectionName);
  return setupPromise
    .then(() => {
      const options = { writeConcern: { w: 'majority' } };
      if (suite.encrypted_fields) {
        options.encryptedFields = suite.encrypted_fields;
      }
      return coll.drop(options);
    })
    .catch(err => {
      if (!err.message.match(/ns not found/)) throw err;
    })
    .then(() => {
      if (suite.key_vault_data) {
        const dataKeysCollection = context.sharedClient.db('keyvault').collection('datakeys');
        return dataKeysCollection
          .drop({ writeConcern: { w: 'majority' } })
          .catch(err => {
            if (!err.message.match(/ns not found/)) {
              throw err;
            }
          })
          .then(() => {
            if (suite.key_vault_data.length) {
              return dataKeysCollection.insertMany(suite.key_vault_data, {
                writeConcern: { w: 'majority' }
              });
            }
          });
      }
    })
    .then(() => {
      const options = { writeConcern: { w: 'majority' } };
      if (suite.json_schema) {
        options.validator = { $jsonSchema: suite.json_schema };
      }
      if (suite.encrypted_fields) {
        options.encryptedFields = suite.encrypted_fields;
      }

      return db.createCollection(context.collectionName, options);
    })
    .then(() => {
      if (suite.data && Array.isArray(suite.data) && suite.data.length > 0) {
        return coll.insertMany(suite.data, { writeConcern: { w: 'majority' } });
      }
    })
    .then(() => {
      return context.runForAllClients(client => {
        return client
          .db(context.dbName)
          .collection(context.collectionName)
          .distinct('x')
          .catch(() => {});
      });
    });
}

function parseSessionOptions(options) {
  const result = Object.assign({}, options);
  if (result.defaultTransactionOptions && result.defaultTransactionOptions.readPreference) {
    result.defaultTransactionOptions.readPreference = normalizeReadPreference(
      result.defaultTransactionOptions.readPreference.mode
    );
  }

  return result;
}

const IGNORED_COMMANDS = new Set([LEGACY_HELLO_COMMAND, 'configureFailPoint', 'endSessions']);
const SDAM_EVENTS = new Set([
  ...TOPOLOGY_EVENTS.filter(ev => !['error', 'timeout', 'close'].includes(ev)),
  ...HEARTBEAT_EVENTS
]);

const CMAP_EVENTS = new Set(SOURCE_CMAP_EVENTS);

function runTestSuiteTest(configuration, spec, context) {
  context.commandEvents = [];
  const clientOptions = translateClientOptions({
    heartbeatFrequencyMS: 100,
    minHeartbeatFrequencyMS: 100,
    monitorCommands: true,
    ...spec.clientOptions,
    __skipPingOnConnect: true
  });

  if (context.requiresCSFLE) {
    clientOptions.promoteValues = false;
    clientOptions.promoteLongs = false;
  }

  const url = resolveConnectionString(configuration, spec, context);
  const client = configuration.newClient(url, clientOptions);
  CMAP_EVENTS.forEach(eventName => client.on(eventName, event => context.cmapEvents.push(event)));
  SDAM_EVENTS.forEach(eventName => client.on(eventName, event => context.sdamEvents.push(event)));

  client.on('commandStarted', event => {
    if (!IGNORED_COMMANDS.has(event.commandName)) {
      context.commandEvents.push(event);
    }
  });

  return client.connect().then(client => {
    context.testClient = client;
    const sessionOptions = Object.assign({}, spec.transactionOptions);

    spec.sessionOptions = spec.sessionOptions || {};
    const database = client.db(context.dbName);

    let session0, session1;
    let savedSessionData;

    if (context.useSessions) {
      try {
        session0 = client.startSession(
          Object.assign({}, sessionOptions, parseSessionOptions(spec.sessionOptions.session0))
        );
        session1 = client.startSession(
          Object.assign({}, sessionOptions, parseSessionOptions(spec.sessionOptions.session1))
        );

        savedSessionData = {
          session0: JSON.parse(EJSON.stringify(session0.id)),
          session1: JSON.parse(EJSON.stringify(session1.id))
        };
      } catch {
        // ignore
      }
    }

    const operationContext = {
      client,
      database,
      collectionName: context.collectionName,
      session0,
      session1,
      testRunner: context
    };

    let testPromise = Promise.resolve();
    return testPromise
      .then(() => testOperations(spec, operationContext))
      .finally(() => {
        const promises = [];
        if (session0) promises.push(session0.endSession());
        if (session1) promises.push(session1.endSession());
        return Promise.all(promises);
      })
      .then(() => validateExpectations(context.commandEvents, spec, savedSessionData));
  });
}

function validateOutcome(testData, testContext) {
  if (testData.outcome && testData.outcome.collection) {
    const outcomeCollection = testData.outcome.collection.name || testContext.collectionName;

    // use the client without transactions to verify
    return testContext.sharedClient
      .db(testContext.dbName)
      .collection(outcomeCollection)
      .find({}, { readPreference: 'primary', readConcern: { level: 'local' } })
      .sort({ _id: 1 })
      .toArray()
      .then(docs => {
        expect(docs).to.matchMongoSpec(testData.outcome.collection.data);
      });
  }

  return Promise.resolve();
}

function validateExpectations(commandEvents, spec, savedSessionData) {
  if (!spec.expectations || !Array.isArray(spec.expectations) || spec.expectations.length === 0) {
    return;
  }

  const actualEvents = normalizeCommandShapes(commandEvents);
  const rawExpectedEvents = spec.expectations.map(x => x.command_started_event);
  const expectedEvents = normalizeCommandShapes(rawExpectedEvents);

  expect(actualEvents).to.have.lengthOf(expectedEvents.length);

  for (const [idx, expectedEvent] of expectedEvents.entries()) {
    const actualEvent = actualEvents[idx];

    if (typeof expectedEvent.commandName === 'string') {
      expect(actualEvent).to.have.property('commandName', expectedEvent.commandName);
    }

    if (typeof expectedEvent.databaseName === 'string') {
      expect(actualEvent).to.have.property('databaseName', expectedEvent.databaseName);
    }

    const actualCommand = actualEvent.command;
    const expectedCommand = expectedEvent.command;
    if (expectedCommand.sort) {
      // TODO(NODE-3235): This is a workaround that works because all sorts in the specs
      // are objects with one key; ideally we'd want to adjust the spec definitions
      // to indicate whether order matters for any given key and set general
      // expectations accordingly
      expect(Object.keys(expectedCommand.sort)).to.have.lengthOf(1);
      expect(actualCommand.sort).to.be.instanceOf(Map);
      expect(actualCommand.sort.size).to.equal(1);
      const expectedKey = Object.keys(expectedCommand.sort)[0];
      expect(actualCommand.sort).to.have.all.keys(expectedKey);
      actualCommand.sort = { [expectedKey]: actualCommand.sort.get(expectedKey) };
    }

    if (expectedCommand.createIndexes) {
      // TODO(NODE-3235): This is a workaround that works because all indexes in the specs
      // are objects with one key; ideally we'd want to adjust the spec definitions
      // to indicate whether order matters for any given key and set general
      // expectations accordingly
      for (const [i, dbIndex] of actualCommand.indexes.entries()) {
        expect(Object.keys(expectedCommand.indexes[i].key)).to.have.lengthOf(1);
        expect(dbIndex.key).to.be.instanceOf(Map);
        expect(dbIndex.key.size).to.equal(1);
      }
      actualCommand.indexes = actualCommand.indexes.map(dbIndex => ({
        ...dbIndex,
        key: Object.fromEntries(dbIndex.key)
      }));
    }

    expect(actualCommand).withSessionData(savedSessionData).to.matchMongoSpec(expectedCommand);
  }
}

function normalizeCommandShapes(commands) {
  return commands.map(def => {
    const output = JSON.parse(
      EJSON.stringify(
        {
          command: def.command,
          commandName: def.command_name || def.commandName || Object.keys(def.command)[0],
          databaseName: def.database_name ? def.database_name : def.databaseName
        },
        { relaxed: true }
      )
    );
    // TODO: this is a workaround to preserve sort Map type until NODE-3235 is completed
    if (def.command.sort) {
      output.command.sort = def.command.sort;
    }
    if (def.command.createIndexes) {
      for (const [i, dbIndex] of output.command.indexes.entries()) {
        dbIndex.key = def.command.indexes[i].key;
      }
    }
    return output;
  });
}

function extractCrudResult(result, operation) {
  if (Array.isArray(result) || !isRecord(result)) {
    return result;
  }

  if (result.value) {
    // some of our findAndModify results return more than just an id, so we need to pluck
    const resultKeys = Object.keys(operation.result);
    if (resultKeys.length === 1 && resultKeys[0] === '_id') {
      return { _id: result.value._id };
    }

    return result.value;
  }

  return operation.result;
}

function isTransactionCommand(command) {
  return ['startTransaction', 'commitTransaction', 'abortTransaction'].indexOf(command) !== -1;
}

function isTestRunnerCommand(context, commandName) {
  const testRunnerContext = context.testRunner;

  let methods = new Set();
  let object = testRunnerContext;
  while (object !== Object.prototype) {
    Object.getOwnPropertyNames(object)
      .filter(prop => typeof object[prop] === 'function' && prop !== 'constructor')
      .map(prop => methods.add(prop));

    object = Object.getPrototypeOf(object);
  }

  return methods.has(commandName);
}

function extractBulkRequests(requests) {
  return requests.map(request => ({ [request.name]: request.arguments }));
}

function translateOperationName(operationName) {
  if (operationName === 'runCommand') return 'command';
  if (operationName === 'listDatabaseNames') return 'listDatabases';
  if (operationName === 'listCollectionNames') return 'listCollections';
  return operationName;
}

function normalizeReadPreference(mode) {
  return mode.charAt(0).toLowerCase() + mode.substr(1);
}

function resolveOperationArgs(operationName, operationArgs, context) {
  const result = [];
  function pluck(fromObject, toArray, fields) {
    for (const field of fields) {
      if (fromObject[field]) toArray.push(fromObject[field]);
    }
  }

  // TODO: migrate all operations here
  if (operationName === 'distinct') {
    pluck(operationArgs, result, ['fieldName', 'filter']);
    if (result.length === 1) result.push({});
  } else {
    return;
  }

  // compile the options
  const options = {};
  if (operationArgs.options) {
    Object.assign(options, operationArgs.options);
    if (options.readPreference) {
      options.readPreference = normalizeReadPreference(options.readPreference.mode);
    }
  }

  if (operationArgs.session) {
    if (isTransactionCommand(operationName)) return;
    options.session = context[operationArgs.session];
  }

  result.push(options);

  // determine if there is a callback to add
  if (operationArgs.callback) {
    result.push(() =>
      testOperations(operationArgs.callback, context, { swallowOperationErrors: false })
    );
  }

  return result;
}

const CURSOR_COMMANDS = new Set(['find', 'aggregate', 'listIndexes', 'listCollections']);
const ADMIN_COMMANDS = new Set(['listDatabases']);

function maybeSession(operation, context) {
  return (
    operation &&
    operation.arguments &&
    operation.arguments.session &&
    context[operation.arguments.session]
  );
}

function withoutCommandMonitoring(client, fn) {
  const listeners = client.rawListeners('commandStarted');
  client.removeAllListeners('commandStarted');
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      for (const listener of listeners) {
        client.on('commandStarted', listener);
      }
    });
}

const kOperations = new Map([
  [
    'recordPrimary',
    (operation, testRunner, context /*, options */) => {
      testRunner.recordPrimary(context.client);
    }
  ],
  [
    'waitForPrimaryChange',
    (operation, testRunner, context /*, options */) => {
      return testRunner.waitForPrimaryChange(context.client);
    }
  ],
  [
    'runOnThread',
    (operation, testRunner, context, options) => {
      const args = operation.arguments;
      const threadName = args.name;
      const subOperation = args.operation;

      return testRunner.runOnThread(
        threadName,
        testOperation(subOperation, context[subOperation.object], context, options)
      );
    }
  ],
  [
    'createIndex',
    (operation, collection, context /*, options */) => {
      const fieldOrSpec = operation.arguments.keys;
      const options = { session: maybeSession(operation, context) };
      if (operation.arguments.name) options.name = operation.arguments.name;
      return collection.createIndex(fieldOrSpec, options);
    }
  ],
  [
    'createCollection',
    (operation, db, context /*, options */) => {
      const collectionName = operation.arguments.collection;
      const encryptedFields = operation.arguments.encryptedFields;
      const validator = operation.arguments.validator;
      const session = maybeSession(operation, context);
      return db.createCollection(collectionName, { session, encryptedFields, validator });
    }
  ],
  [
    'dropCollection',
    (operation, db, context /*, options */) => {
      const collectionName = operation.arguments.collection;
      const encryptedFields = operation.arguments.encryptedFields;
      const session = maybeSession(operation, context);
      return db.dropCollection(collectionName, { session, encryptedFields }).catch(err => {
        if (!err.message.match(/ns not found/)) {
          throw err;
        }
      });
    }
  ],
  [
    'dropIndex',
    (operation, collection /*, context, options */) => {
      const indexName = operation.arguments.name;
      const session = maybeSession(operation, context);
      return collection.dropIndex(indexName, { session });
    }
  ],
  [
    'mapReduce',
    // eslint-disable-next-line no-unused-vars
    (operation, collection, context /*, options */) => {
      throw new Error(
        'The Node driver no longer supports a MapReduce helper.  This operation should never be run.'
      );
    }
  ],
  [
    'assertCollectionExists',
    (operation, testRunnerContext, context /*, options */) => {
      const collectionName = operation.arguments.collection;
      const session = maybeSession(operation, context);
      const db = context.client.db(operation.arguments.database);
      return withoutCommandMonitoring(context.client, () =>
        db
          .listCollections({ session })
          .toArray()
          .then(results => results.map(({ name }) => name))
          .then(collections => expect(collections).to.include(collectionName))
      );
    }
  ],
  [
    'assertCollectionNotExists',
    (operation, testRunnerContext, context /*, options */) => {
      const collectionName = operation.arguments.collection;
      const session = maybeSession(operation, context);
      const db = context.client.db(operation.arguments.database);
      return withoutCommandMonitoring(context.client, () =>
        db
          .listCollections({ session })
          .toArray()
          .then(results => results.map(({ name }) => name))
          .then(collections => expect(collections).to.not.include(collectionName))
      );
    }
  ],
  [
    'assertIndexExists',
    (operation, testRunnerContext, context /*, options */) => {
      const collectionName = operation.arguments.collection;
      const indexName = operation.arguments.index;
      const session = maybeSession(operation, context);
      const db = context.client.db(operation.arguments.database);
      return withoutCommandMonitoring(context.client, () =>
        db
          .collection(collectionName)
          .listIndexes({ session })
          .toArray()
          .then(results => results.map(({ name }) => name))
          .then(indexes => expect(indexes).to.include(indexName))
      );
    }
  ],
  [
    'assertIndexNotExists',
    (operation, testRunnerContext, context /*, options */) => {
      const collectionName = operation.arguments.collection;
      const indexName = operation.arguments.index;
      const session = maybeSession(operation, context);
      const db = context.client.db(operation.arguments.database);
      return withoutCommandMonitoring(context.client, () =>
        db
          .collection(collectionName)
          .listIndexes({ session })
          .toArray()
          .then(results => results.map(({ name }) => name))
          .then(indexes => expect(indexes).to.not.include(indexName))
      ).catch(err => {
        // The error message can differ slightly with the same error code.
        if (!err.message.match(/ns not found|ns does not exist/)) {
          throw err;
        }
      });
    }
  ]
]);

/**
 * @param {object} operation the operation definition from the spec test
 * @param {object} obj the object to call the operation on
 * @param {object} context a context object containing sessions used for the test
 * @param {object} [options] Optional settings
 * @param {boolean} [options.swallowOperationErrors] Generally we want to observe operation errors, validate them against our expectations, and then swallow them. In cases like `withTransaction` we want to use the same `testOperations` to build the lambda, and in those cases it is not desireable to swallow the errors, since we need to test this behavior.
 */
function testOperation(operation, obj, context, options) {
  options = options || { swallowOperationErrors: true };
  const opOptions = {};
  let args = [];
  const operationName = translateOperationName(operation.name);

  let opPromise;
  if (kOperations.has(operationName)) {
    opPromise = kOperations.get(operationName)(operation, obj, context, options);
  } else {
    if (operation.arguments) {
      args = resolveOperationArgs(operationName, operation.arguments, context);

      if (args == null) {
        args = [];
        Object.keys(operation.arguments).forEach(key => {
          if (key === 'callback') {
            args.push(() =>
              testOperations(operation.arguments.callback, context, {
                swallowOperationErrors: false
              })
            );
            return;
          }

          if (['filter', 'fieldName', 'document', 'documents', 'pipeline'].indexOf(key) !== -1) {
            return args.unshift(operation.arguments[key]);
          }

          if (key === 'command') return args.unshift(operation.arguments[key]);
          if (key === 'requests')
            return args.unshift(extractBulkRequests(operation.arguments[key]));
          if (key === 'update' || key === 'replacement') return args.push(operation.arguments[key]);
          if (key === 'session') {
            if (isTransactionCommand(operationName)) return;
            opOptions.session = context[operation.arguments.session];
            return;
          }

          if (key === 'returnDocument') {
            opOptions.returnDocument = operation.arguments[key].toLowerCase();
            return;
          }

          if (key === 'options') {
            Object.assign(opOptions, operation.arguments[key]);
            if (opOptions.readPreference) {
              opOptions.readPreference = normalizeReadPreference(opOptions.readPreference.mode);
            }

            return;
          }

          if (key === 'readPreference') {
            opOptions[key] = normalizeReadPreference(operation.arguments[key].mode);
            return;
          }

          opOptions[key] = operation.arguments[key];
        });
      }
    }

    if (
      args.length === 0 &&
      !isTransactionCommand(operationName) &&
      !isTestRunnerCommand(context, operationName)
    ) {
      args.push({});
    }

    if (Object.keys(opOptions).length > 0) {
      // NOTE: this is awful, but in order to provide options for some methods we need to add empty
      //       query objects.
      if (operationName === 'distinct') {
        args.push({});
      }

      args.push(opOptions);
    }

    if (ADMIN_COMMANDS.has(operationName)) {
      obj = obj.db().admin();
    }

    if (operation.name === 'listDatabaseNames' || operation.name === 'listCollectionNames') {
      opOptions.nameOnly = true;
    }

    if (CURSOR_COMMANDS.has(operationName)) {
      // `find` creates a cursor, so we need to call `toArray` on it
      const cursor = obj[operationName].apply(obj, args);
      opPromise = cursor.toArray();
    } else {
      if (!obj[operationName]) {
        throw new Error(`Unknown operation "${operationName}"`);
      }
      // wrap this in a `promiseTry` because some operations might throw
      opPromise = promiseTry(() => obj[operationName].apply(obj, args));
    }
  }

  if (operation.error) {
    opPromise = opPromise.then(
      () => {
        throw new Error('expected an error!');
      },
      () => {}
    );
  }

  if (operation.result) {
    const result = operation.result;

    if (
      result.errorContains != null ||
      result.errorCodeName ||
      result.errorLabelsContain ||
      result.errorLabelsOmit
    ) {
      return opPromise.then(
        () => {
          throw new Error('expected an error!');
        },
        err => {
          const errorContains = result.errorContains;
          const errorCodeName = result.errorCodeName;
          const errorLabelsContain = result.errorLabelsContain;
          const errorLabelsOmit = result.errorLabelsOmit;

          if (errorLabelsContain) {
            expect(err).to.have.property('errorLabels');
            expect(err.errorLabels).to.include.members(errorLabelsContain);
          }

          if (errorLabelsOmit) {
            if (err.errorLabels && Array.isArray(err.errorLabels) && err.errorLabels.length !== 0) {
              expect(errorLabelsOmit).to.not.include.members(err.errorLabels);
            }
          }

          if (operation.result.errorContains) {
            expect(err.message).to.match(new RegExp(escape(errorContains), 'i'));
          }

          if (errorCodeName) {
            expect(err.codeName).to.equal(errorCodeName);
          }

          if (!options.swallowOperationErrors) {
            throw err;
          }
        }
      );
    }

    return opPromise.then(opResult => {
      const actual = extractCrudResult(opResult, operation);
      expect(actual).to.matchMongoSpec(operation.result);
    });
  }

  return opPromise;
}

function convertCollectionOptions(options) {
  const result = {};
  Object.keys(options).forEach(key => {
    if (key === 'readPreference') {
      result[key] = normalizeReadPreference(options[key].mode);
    } else {
      result[key] = options[key];
    }
  });

  return result;
}

async function testOperations(testData, operationContext, options) {
  options = options || { swallowOperationErrors: true };

  for (const operation of testData.operations) {
    const object = operation.object || 'collection';
    if (object === 'collection') {
      const db = operationContext.database;
      const collectionName = operationContext.collectionName;
      const collectionOptions = operation.collectionOptions || {};

      operationContext[object] = db.collection(
        collectionName,
        convertCollectionOptions(collectionOptions)
      );
    }
    await testOperation(operation, operationContext[object], operationContext, options);
  }
}

module.exports = {
  TestRunnerContext,
  gatherTestSuites,
  generateTopologyTests,
  legacyRunOnToRunOnRequirement
};
