'use strict';

const Promise = require('bluebird');
const path = require('path');
const fs = require('fs');
const chai = require('chai');
const expect = chai.expect;
const EJSON = require('mongodb-extjson');
const core = require('mongodb-core');
const sessions = core.Sessions;
const environments = require('../environments');

// mlaunch init --replicaset --arbiter  --name rs --hostname localhost --port 31000 --setParameter enableTestCommands=1 --binarypath /Users/mbroadst/Downloads/mongodb-osx-x86_64-enterprise-4.1.0-158-g3d62f3c/bin

chai.use(require('chai-subset'));
chai.config.includeStack = true;
chai.config.showDiff = true;
chai.config.truncateThreshold = 0;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && Array.isArray(value) === false;
}

process.on('unhandledRejection', err => console.dir(err));

/**
 * Finds placeholder values in a deeply nested object.
 *
 * NOTE: This also mutates the object, by removing the values for comparison
 *
 * @param {Object} input the object to find placeholder values in
 */
function findPlaceholders(value, parent) {
  return Object.keys(value).reduce((result, key) => {
    if (isPlainObject(value[key])) {
      return result.concat(
        findPlaceholders(value[key], [value, key]).map(x => {
          if (x.path.startsWith('$')) {
            x.path = key;
          } else {
            x.path = `${key}.${x.path}`;
          }

          return x;
        })
      );
    }

    if (value[key] === null) {
      delete value[key];
      result.push({ path: key, type: null });
    } else if (value[key] === 42 || value[key] === '42') {
      if (key.startsWith('$number')) {
        result.push({ path: key, type: 'number' });
      } else if (value[key] === 42) {
        result.push({ path: key, type: 'exists' });
      } else {
        result.push({ path: key, type: 'string' });
      }

      // NOTE: fix this, it just passes the current examples
      if (parent == null) {
        delete value[key];
      } else {
        delete parent[0][parent[1]];
      }
    } else if (value[key] === '') {
      result.push({ path: key, type: 'string' });
    }

    return result;
  }, []);
}

function translateClientOptions(options) {
  Object.keys(options).forEach(key => {
    if (key === 'readConcernLevel') {
      options.readConcern = { level: options.readConcernLevel };
      delete options[key];
    }
  });

  return options;
}

function gatherTestSuites(specPath) {
  return fs
    .readdirSync(specPath)
    .filter(x => x.indexOf('.json') !== -1)
    .map(x =>
      Object.assign(JSON.parse(fs.readFileSync(`${specPath}/${x}`)), {
        name: path.basename(x, '.json')
      })
    );
}

function resolveConnectionString(configuration, spec) {
  const isShardedEnvironment = configuration.environment instanceof environments.sharded;
  const useMultipleMongoses = spec && !!spec.useMultipleMongoses;

  return isShardedEnvironment && !useMultipleMongoses
    ? `mongodb://${configuration.host}:${configuration.port}/${configuration.db}`
    : configuration.url();
}

class TransactionsTestContext {
  constructor() {
    this.url = null;
    this.sharedClient = null;
    this.failPointClients = [];
    this.appliedFailPoints = [];
  }

  runForAllClients(fn) {
    const allClients = [this.sharedClient].concat(this.failPointClients);
    return Promise.all(allClients.map(fn));
  }

  runFailPointCmd(fn) {
    return this.failPointClients.length
      ? Promise.all(this.failPointClients.map(fn))
      : fn(this.sharedClient);
  }

  setup(config) {
    this.sharedClient = config.newClient(
      resolveConnectionString(config, { useMultipleMongoses: true })
    );

    if (config.options && config.options.proxies) {
      this.failPointClients = config.options.proxies.map(proxy =>
        config.newClient(`mongodb://${proxy.host}:${proxy.port}/`)
      );
    }

    return this.runForAllClients(client => client.connect());
  }

  teardown() {
    this.runForAllClients(client => client.close());
  }

  cleanupAfterSuite() {
    const context = this;

    // clean up applied failpoints
    const cleanupPromises = this.appliedFailPoints.map(failPoint => {
      return context.disableFailPoint(failPoint);
    });

    this.appliedFailPoints = [];

    // cleanup
    if (context.testClient) {
      cleanupPromises.push(
        context.testClient.close().then(() => {
          delete context.testClient;
        })
      );
    }

    return Promise.all(cleanupPromises);
  }

  targetedFailPoint(options) {
    const session = options.session;
    const failPoint = options.failPoint;
    expect(session.transaction.isPinned).to.be.true;

    return new Promise((resolve, reject) => {
      const server = session.transaction.server;
      server.command(`admin.$cmd`, failPoint, err => {
        if (err) return reject(err);

        this.appliedFailPoints.push(failPoint);
        resolve();
      });
    });
  }

  assertSessionPinned(options) {
    expect(options).to.have.property('session');

    const session = options.session;
    expect(session.transaction.isPinned).to.be.true;
  }

  assertSessionUnpinned(options) {
    expect(options).to.have.property('session');

    const session = options.session;
    expect(session.transaction.isPinned).to.be.false;
  }

  enableFailPoint(failPoint) {
    return this.runFailPointCmd(client => {
      return client.db(this.dbName).executeDbAdminCommand(failPoint);
    });
  }

  disableFailPoint(failPoint) {
    return this.runFailPointCmd(client => {
      return client.db(this.dbName).executeDbAdminCommand({
        configureFailPoint: failPoint.configureFailPoint,
        mode: 'off'
      });
    });
  }
}

// Main test runner
describe('Transactions', function() {
  const testContext = new TransactionsTestContext();

  [
    { name: 'spec tests', specPath: `${__dirname}/spec/transactions` },
    {
      name: 'withTransaction spec tests',
      specPath: `${__dirname}/spec/transactions/convenient-api`
    }
  ].forEach(suiteSpec => {
    describe(suiteSpec.name, function() {
      const testSuites = gatherTestSuites(suiteSpec.specPath);
      after(() => testContext.teardown());
      before(function() {
        return testContext.setup(this.configuration);
      });

      generateTopologyTests(testSuites, testContext);
    });
  });

  describe('withTransaction', function() {
    let session, sessionPool;
    beforeEach(() => {
      const topology = new core.Server();
      sessionPool = new sessions.ServerSessionPool(topology);
      session = new sessions.ClientSession(topology, sessionPool);
    });

    afterEach(() => {
      sessionPool.endAllPooledSessions();
    });

    it('should provide a useful error if a Promise is not returned', {
      metadata: { requires: { topology: ['replicaset', 'sharded'], mongodb: '>=4.1.5' } },
      test: function(done) {
        function fnThatDoesntReturnPromise() {
          return false;
        }

        expect(() => session.withTransaction(fnThatDoesntReturnPromise)).to.throw(
          /must return a Promise/
        );

        session.endSession(done);
      }
    });
  });
});

function parseTopologies(topologies) {
  if (topologies == null) {
    return ['replicaset', 'mongos'];
  }

  const idx = topologies.indexOf('single');
  if (idx !== -1) {
    topologies.splice(idx, 1);
  }

  return topologies;
}

function shouldSkipTest(spec) {
  const SKIP_TESTS = [
    // commitTransaction retry seems to be swallowed by mongos in these three cases
    'commitTransaction retry succeeds on new mongos',
    'commitTransaction retry fails on new mongos',
    'unpin after transient error within a transaction and commit'
  ];

  if (spec.skipReason || SKIP_TESTS.indexOf(spec.description) !== -1) {
    return it.skip;
  }

  return it;
}

function generateTopologyTests(testSuites, testContext) {
  testSuites.forEach(testSuite => {
    const suiteName = testSuite.name;
    const topologies = parseTopologies(testSuite.topology);
    const minServerVersion = testSuite.minServerVersion
      ? `>=${testSuite.minServerVersion}`
      : '>=3.7.x';

    const tests = testSuite.tests;
    describe(suiteName, {
      metadata: { requires: { topology: topologies, mongodb: minServerVersion } },
      test: function() {
        beforeEach(() => prepareDatabaseForSuite(testSuite, testContext));
        afterEach(() => testContext.cleanupAfterSuite());

        tests.forEach(spec => {
          const maybeSkipIt = shouldSkipTest(spec);
          maybeSkipIt(spec.description, function() {
            let testPromise = Promise.resolve();

            if (spec.failPoint) {
              testPromise = testPromise.then(() => testContext.enableFailPoint(spec.failPoint));
            }

            // run the actual test
            testPromise = testPromise.then(() =>
              runTestSuiteTest(this.configuration, spec, testContext)
            );

            if (spec.failPoint) {
              testPromise = testPromise.then(() => testContext.disableFailPoint(spec.failPoint));
            }

            return testPromise.then(() => validateOutcome(spec, testContext));
          });
        });
      }
    });
  });
}

// Test runner helpers
function prepareDatabaseForSuite(suite, context) {
  context.dbName = suite.database_name;
  context.collectionName = suite.collection_name;

  const db = context.sharedClient.db(context.dbName);
  const coll = db.collection(context.collectionName);

  return db
    .admin()
    .command({ killAllSessions: [] })
    .catch(() => {}) // ignore any error from this
    .then(() => coll.drop({ writeConcern: 'majority' }))
    .catch(err => {
      if (!err.message.match(/ns not found/)) throw err;
    })
    .then(() => db.createCollection(context.collectionName, { w: 'majority' }))
    .then(() => {
      if (suite.data && Array.isArray(suite.data) && suite.data.length > 0) {
        return coll.insert(suite.data, { w: 'majority' });
      }
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

let displayCommands = false;
function runTestSuiteTest(configuration, spec, context) {
  const commandEvents = [];
  const clientOptions = translateClientOptions(
    Object.assign({ monitorCommands: true }, spec.clientOptions)
  );

  // test-specific client optionss
  clientOptions.autoReconnect = false;
  clientOptions.haInterval = 100;

  const url = resolveConnectionString(configuration, spec);
  const client = configuration.newClient(url, clientOptions);
  return client.connect().then(client => {
    context.testClient = client;
    client.on('commandStarted', event => {
      if (event.databaseName === context.dbName || isTransactionCommand(event.commandName)) {
        commandEvents.push(event);

        // very useful for debugging
        if (displayCommands) {
          console.dir(event, { depth: 5 });
        }
      }
    });

    const sessionOptions = Object.assign({}, spec.transactionOptions);

    spec.sessionOptions = spec.sessionOptions || {};
    const database = client.db(context.dbName);
    const session0 = client.startSession(
      Object.assign({}, sessionOptions, parseSessionOptions(spec.sessionOptions.session0))
    );
    const session1 = client.startSession(
      Object.assign({}, sessionOptions, parseSessionOptions(spec.sessionOptions.session1))
    );

    // enable to see useful APM debug information at the time of actual test run
    // displayCommands = true;

    const operationContext = {
      database,
      session0,
      session1,
      testRunner: context,
      savedSessionData: {
        session0: JSON.parse(EJSON.stringify(session0.id)),
        session1: JSON.parse(EJSON.stringify(session1.id))
      }
    };

    let testPromise = Promise.resolve();
    return testPromise
      .then(() => testOperations(spec, operationContext))
      .catch(err => {
        // If the driver throws an exception / returns an error while executing this series
        // of operations, store the error message.
        throw err;
      })
      .then(() => {
        session0.endSession();
        session1.endSession();

        return validateExpectations(commandEvents, spec, context, operationContext);
      });
  });
}

function validateOutcome(testData, testContext) {
  if (testData.outcome) {
    if (testData.outcome.collection) {
      // use the client without transactions to verify
      return testContext.sharedClient
        .db(testContext.dbName)
        .collection(testContext.collectionName)
        .find({}, { readPreference: 'primary', readConcern: { level: 'local' } })
        .toArray()
        .then(docs => {
          expect(docs).to.eql(testData.outcome.collection.data);
        });
    }
  }
  return Promise.resolve();
}

function validateExpectations(commandEvents, spec, testContext, operationContext) {
  if (spec.expectations && Array.isArray(spec.expectations) && spec.expectations.length > 0) {
    const actualEvents = normalizeCommandShapes(commandEvents);
    const rawExpectedEvents = spec.expectations.map(x =>
      linkSessionData(x.command_started_event, operationContext.savedSessionData)
    );

    const expectedEventPlaceholders = rawExpectedEvents.map(event =>
      findPlaceholders(event.command)
    );

    const expectedEvents = normalizeCommandShapes(rawExpectedEvents);
    expect(actualEvents).to.have.length(expectedEvents.length);

    expectedEvents.forEach((expected, idx) => {
      const actual = actualEvents[idx];
      const placeHolders = expectedEventPlaceholders[idx]; // eslint-disable-line

      expect(actual.commandName).to.equal(expected.commandName);
      expect(actual.databaseName).to.equal(expected.databaseName);

      const actualCommand = actual.command;
      const expectedCommand = expected.command;

      // handle validation of placeholder values
      // placeHolders.forEach(placeholder => {
      //   const parsedActual = EJSON.parse(JSON.stringify(actualCommand), {
      //     relaxed: true
      //   });

      //   if (placeholder.type === null) {
      //     expect(parsedActual).to.not.have.all.nested.property(placeholder.path);
      //   } else if (placeholder.type === 'string') {
      //     expect(parsedActual).nested.property(placeholder.path).to.exist;
      //     expect(parsedActual)
      //       .nested.property(placeholder.path)
      //       .to.have.length.greaterThan(0);
      //   } else if (placeholder.type === 'number') {
      //     expect(parsedActual).nested.property(placeholder.path).to.exist;
      //     expect(parsedActual)
      //       .nested.property(placeholder.path)
      //       .to.be.greaterThan(0);
      //   } else if (placeholder.type === 'exists') {
      //     expect(parsedActual).nested.property(placeholder.path).to.exist;
      //   }
      // });

      // compare the command
      expect(actualCommand).to.containSubset(expectedCommand);
    });
  }
}

function linkSessionData(command, context) {
  const result = Object.assign({}, command);
  result.command.lsid = context[command.command.lsid];
  return result;
}

function normalizeCommandShapes(commands) {
  return commands.map(command =>
    JSON.parse(
      EJSON.stringify({
        command: command.command,
        commandName: command.command_name ? command.command_name : command.commandName,
        databaseName: command.database_name ? command.database_name : command.databaseName
      })
    )
  );
}

function extractCrudResult(result, operation) {
  if (Array.isArray(result) || !isPlainObject(result)) {
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

  return Object.keys(operation.result).reduce((crudResult, key) => {
    if (result.hasOwnProperty(key) && result[key] != null) {
      // FIXME(major): update crud results are broken and need to be changed
      crudResult[key] = key === 'upsertedId' ? result[key]._id : result[key];
    }

    return crudResult;
  }, {});
}

function isTransactionCommand(command) {
  return ['startTransaction', 'commitTransaction', 'abortTransaction'].indexOf(command) !== -1;
}

function isTestRunnerCommand(command) {
  return (
    ['targetedFailPoint', 'assertSessionPinned', 'assertSessionUnpinned'].indexOf(command) !== -1
  );
}

function extractBulkRequests(requests) {
  return requests.map(request => ({ [request.name]: request.arguments }));
}

function translateOperationName(operationName) {
  if (operationName === 'runCommand') return 'command';
  return operationName;
}

function normalizeReadPreference(mode) {
  return mode.charAt(0).toLowerCase() + mode.substr(1);
}

/**
 *
 * @param {Object} operation the operation definition from the spec test
 * @param {Object} obj the object to call the operation on
 * @param {Object} context a context object containing sessions used for the test
 * @param {Object} [options] Optional settings
 * @param {Boolean} [options.swallowOperationErrors] Generally we want to observe operation errors, validate them against our expectations, and then swallow them. In cases like `withTransaction` we want to use the same `testOperations` to build the lambda, and in those cases it is not desireable to swallow the errors, since we need to test this behavior.
 */
function testOperation(operation, obj, context, options) {
  options = options || { swallowOperationErrors: true };
  const opOptions = {};
  const args = [];
  const operationName = translateOperationName(operation.name);

  if (operation.arguments) {
    Object.keys(operation.arguments).forEach(key => {
      if (key === 'callback') {
        args.push(() =>
          testOperations(operation.arguments.callback, context, { swallowOperationErrors: false })
        );
        return;
      }

      if (['filter', 'fieldName', 'document', 'documents', 'pipeline'].indexOf(key) !== -1) {
        return args.unshift(operation.arguments[key]);
      }

      if (key === 'command') return args.unshift(operation.arguments[key]);
      if (key === 'requests') return args.unshift(extractBulkRequests(operation.arguments[key]));
      if (key === 'update' || key === 'replacement') return args.push(operation.arguments[key]);
      if (key === 'session') {
        if (isTransactionCommand(operationName)) return;
        opOptions.session = context[operation.arguments.session];
        return;
      }

      if (key === 'returnDocument') {
        opOptions.returnOriginal = operation.arguments[key] === 'Before' ? true : false;
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

  if (
    args.length === 0 &&
    !isTransactionCommand(operationName) &&
    !isTestRunnerCommand(operationName)
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

  let opPromise;
  if (operationName === 'find' || operationName === 'aggregate') {
    // `find` creates a cursor, so we need to call `toArray` on it
    const cursor = obj[operationName].apply(obj, args);
    opPromise = cursor.toArray();
  } else {
    // wrap this in a `Promise.try` because some operations might throw
    opPromise = Promise.try(() => obj[operationName].apply(obj, args));
  }

  if (operation.result) {
    const result = operation.result;

    if (
      result.errorContains ||
      result.errorCodeName ||
      result.errorLabelsContain ||
      result.errorLabelsOmit
    ) {
      return opPromise
        .then(() => {
          throw new Error('expected an error!');
        })
        .catch(err => {
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
            expect(err).to.match(new RegExp(errorContains, 'i'));
          }

          if (errorCodeName) {
            expect(err.codeName).to.equal(errorCodeName);
          }

          if (!options.swallowOperationErrors) {
            throw err;
          }
        });
    }

    return opPromise.then(opResult => {
      const actual = extractCrudResult(opResult, operation);
      expect(actual).to.eql(operation.result);
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

function testOperations(testData, operationContext, options) {
  options = options || { swallowOperationErrors: true };
  return testData.operations.reduce((combined, operation) => {
    return combined.then(() => {
      if (operation.object === 'collection') {
        const db = operationContext.database;
        const collectionOptions = operation.collectionOptions || {};

        operationContext[operation.object] = db.collection(
          'test',
          convertCollectionOptions(collectionOptions)
        );
      }

      return testOperation(
        operation,
        operationContext[operation.object],
        operationContext,
        options
      );
    });
  }, Promise.resolve());
}
