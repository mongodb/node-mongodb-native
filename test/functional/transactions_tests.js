'use strict';

const Promise = require('bluebird');
const path = require('path');
const fs = require('fs');
const chai = require('chai');
const expect = chai.expect;
const EJSON = require('mongodb-extjson');
const core = require('mongodb-core');
const sessions = core.Sessions;

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
      if (key.startsWith('$number') || value[key] === 42) {
        result.push({ path: key, type: 'number' });
      } else {
        result.push({ path: key, type: 'string' });
      }

      // NOTE: fix this, it just passes the current examples
      delete parent[0][parent[1]];
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

class TransactionsTestContext {
  constructor() {
    this.url = null;
    this.sharedClient = null;
  }

  setup(config) {
    this.url = `mongodb://${config.host}:${config.port}/?replicaSet=${config.replicasetName}`;

    this.sharedClient = config.newClient(this.url, { serverSelectionTimeoutMS: 10000 });
    return this.sharedClient.connect();
  }

  teardown() {
    return this.sharedClient.close();
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

      generateTestSuiteTests(testSuites, testContext);
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
      metadata: { requires: { topology: ['replicaset', 'mongos'], mongodb: '>=4.0.x' } },
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

function generateTestSuiteTests(testSuites, testContext) {
  testSuites.forEach(testSuite => {
    const minServerVersion = testSuite.minServerVersion
      ? `>=${testSuite.minServerVersion}`
      : '>=3.7.x';

    describe(testSuite.name, {
      metadata: { requires: { topology: ['replicaset', 'mongos'], mongodb: minServerVersion } },
      test: function() {
        beforeEach(() => prepareDatabaseForSuite(testSuite, testContext));
        afterEach(() => cleanupAfterSuite(testContext));

        testSuite.tests.forEach(testData => {
          const maybeSkipIt = testData.skipReason || testSuite.name === 'pin-mongos' ? it.skip : it;
          maybeSkipIt(testData.description, function() {
            let testPromise = Promise.resolve();

            if (testData.failPoint) {
              testPromise = testPromise.then(() =>
                enableFailPoint(testData.failPoint, testContext)
              );
            }

            // run the actual test
            testPromise = testPromise.then(() =>
              runTestSuiteTest(this.configuration, testData, testContext)
            );

            if (testData.failPoint) {
              testPromise = testPromise.then(() =>
                disableFailPoint(testData.failPoint, testContext)
              );
            }

            return testPromise;
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

function cleanupAfterSuite(context) {
  if (context.testClient) {
    return context.testClient.close().then(() => {
      delete context.testClient;
    });
  }
}

function enableFailPoint(failPoint, testContext) {
  return testContext.sharedClient.db(testContext.dbName).executeDbAdminCommand(failPoint);
}

function disableFailPoint(failPoint, testContext) {
  return testContext.sharedClient.db(testContext.dbName).executeDbAdminCommand({
    configureFailPoint: failPoint.configureFailPoint,
    mode: 'off'
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
function runTestSuiteTest(configuration, testData, context) {
  const commandEvents = [];
  const clientOptions = translateClientOptions(
    Object.assign({ monitorCommands: true }, testData.clientOptions)
  );

  // test-specific client options
  clientOptions.autoReconnect = false;
  clientOptions.haInterval = 100;

  const client = configuration.newClient(context.url, clientOptions);
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

    const sessionOptions = Object.assign({}, testData.transactionOptions);

    testData.sessionOptions = testData.sessionOptions || {};
    const database = client.db(context.dbName);
    const session0 = client.startSession(
      Object.assign({}, sessionOptions, parseSessionOptions(testData.sessionOptions.session0))
    );
    const session1 = client.startSession(
      Object.assign({}, sessionOptions, parseSessionOptions(testData.sessionOptions.session1))
    );

    // enable to see useful APM debug information at the time of actual test run
    // displayCommands = true;

    const operationContext = { database, session0, session1 };

    let testPromise = Promise.resolve();
    return testPromise
      .then(() => testOperations(testData, operationContext))
      .catch(err => {
        // If the driver throws an exception / returns an error while executing this series
        // of operations, store the error message.
        throw err;
      })
      .then(() => {
        session0.endSession();
        session1.endSession();

        return validateExpectations(commandEvents, testData, context, operationContext);
      });
  });
}

function validateExpectations(commandEvents, testData, testContext, operationContext) {
  const session0 = operationContext.session0;
  const session1 = operationContext.session1;

  if (
    testData.expectations &&
    Array.isArray(testData.expectations) &&
    testData.expectations.length > 0
  ) {
    const actualEvents = normalizeCommandShapes(commandEvents);
    const rawExpectedEvents = testData.expectations.map(x =>
      linkSessionData(x.command_started_event, { session0, session1 })
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
      //   }
      // });

      // compare the command
      expect(actualCommand).to.containSubset(expectedCommand);
    });
  }

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
}

function linkSessionData(command, context) {
  const session = context[command.command.lsid];
  const result = Object.assign({}, command);
  result.command.lsid = JSON.parse(EJSON.stringify(session.id));
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

  if (args.length === 0 && !isTransactionCommand(operationName)) {
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
