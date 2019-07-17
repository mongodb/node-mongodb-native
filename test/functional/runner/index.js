'use strict';
const Promise = require('bluebird');
const path = require('path');
const fs = require('fs');
const chai = require('chai');
const expect = chai.expect;
const EJSON = require('mongodb-extjson');
const TestRunnerContext = require('./context').TestRunnerContext;
const resolveConnectionString = require('./utils').resolveConnectionString;

chai.use(require('chai-subset'));
chai.use(require('./matcher').default);
chai.config.includeStack = true;
chai.config.showDiff = true;
chai.config.truncateThreshold = 0;

function escape(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && Array.isArray(value) === false;
}

function translateClientOptions(options) {
  Object.keys(options).forEach(key => {
    if (key === 'readConcernLevel') {
      options.readConcern = { level: options.readConcernLevel };
      delete options[key];
    } else if (key === 'autoEncryptOpts') {
      options.autoEncryption = Object.assign({}, options.autoEncryptOpts);

      if (options.autoEncryptOpts.kmsProviders) {
        delete options.kmsProviders;
        options.autoEncryption.kmsProviders = options.autoEncryptOpts.kmsProviders;

        const kmsProviders = options.autoEncryption.kmsProviders;
        if (kmsProviders.aws) {
          const awsProvider = kmsProviders.aws;
          awsProvider.accessKeyId = process.env.AWS_ACCESS_KEY_ID || 'NOT_PROVIDED';
          awsProvider.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || 'NOT_PROVIDED';
        }

        if (kmsProviders.local && kmsProviders.local.key) {
          const localKey = kmsProviders.local.key;
          if (localKey._bsontype && localKey._bsontype === 'Binary' && localKey.sub_type === 0) {
            // this is read in as BSON Binary subtype 0, extract the Buffer
            kmsProviders.local.key = kmsProviders.local.key.buffer;
          }
        }
      }

      delete options.autoEncryptOpts;
    }
  });

  return options;
}

function gatherTestSuites(specPath) {
  return fs
    .readdirSync(specPath)
    .filter(x => x.indexOf('.json') !== -1)
    .map(x =>
      Object.assign(EJSON.parse(fs.readFileSync(path.join(specPath, x)), { relaxed: true }), {
        name: path.basename(x, '.json')
      })
    );
}

function parseTopologies(topologies) {
  if (topologies == null) {
    return ['replicaset', 'mongos', 'single'];
  }

  return topologies;
}

function parseRunOn(runOn) {
  return runOn.map(config => {
    const topology = parseTopologies(config.topology);
    const version = [];
    if (config.minServerVersion) {
      version.push(`>= ${config.minServerVersion}`);
    }

    if (config.maxServerVersion) {
      version.push(`<= ${config.maxServerVersion}`);
    }

    const mongodb = version.join(' ');
    return { topology, mongodb };
  });
}

function generateTopologyTests(testSuites, testContext, filter) {
  testSuites.forEach(testSuite => {
    // TODO: remove this when SPEC-1255 is completed
    let runOn = testSuite.runOn;
    if (!testSuite.runOn) {
      runOn = [{ minServerVersion: testSuite.minServerVersion }];
    }

    const environmentRequirementList = parseRunOn(runOn);

    environmentRequirementList.forEach(requires => {
      const suiteName = `${testSuite.name} - ${requires.topology.join()}`;
      describe(suiteName, {
        metadata: { requires },
        test: function() {
          beforeEach(() => prepareDatabaseForSuite(testSuite, testContext));
          afterEach(() => testContext.cleanupAfterSuite());

          testSuite.tests.forEach(spec => {
            const maybeSkipIt =
              spec.skipReason || (filter && typeof filter === 'function' && !filter(spec))
                ? it.skip
                : it;

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
  });
}

// Test runner helpers
function prepareDatabaseForSuite(suite, context) {
  context.dbName = suite.database_name;
  context.collectionName = suite.collection_name;

  const db = context.sharedClient.db(context.dbName);
  const setupPromise = db
    .admin()
    .command({ killAllSessions: [] })
    .catch(err => {
      if (err.code === 11601) {
        return;
      }

      throw err;
    });

  if (context.collectionName == null) {
    return setupPromise;
  }

  const coll = db.collection(context.collectionName);
  return setupPromise
    .then(() => coll.drop({ writeConcern: 'majority' }))
    .catch(err => {
      if (!err.message.match(/ns not found/)) throw err;
    })
    .then(() => {
      if (suite.key_vault_data) {
        const dataKeysCollection = context.sharedClient.db('admin').collection('datakeys');
        return dataKeysCollection
          .drop({ w: 'majority' })
          .catch(err => {
            if (!err.message.match(/ns not found/)) {
              throw err;
            }
          })
          .then(() => {
            if (suite.key_vault_data.length) {
              return dataKeysCollection.insertMany(suite.key_vault_data, { w: 'majority' });
            }
          });
      }
    })
    .then(() => {
      const options = { w: 'majority' };
      if (suite.json_schema) {
        options.validator = { $jsonSchema: suite.json_schema };
      }

      return db.createCollection(context.collectionName, options);
    })
    .then(() => {
      if (suite.data && Array.isArray(suite.data) && suite.data.length > 0) {
        return coll.insertMany(suite.data, { w: 'majority' });
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

const IGNORED_COMMANDS = new Set(['ismaster']);

let displayCommands = false;
function runTestSuiteTest(configuration, spec, context) {
  context.commandEvents = [];
  const clientOptions = translateClientOptions(
    Object.assign({ monitorCommands: true }, spec.clientOptions)
  );

  // test-specific client options
  clientOptions.autoReconnect = false;
  clientOptions.haInterval = 100;
  clientOptions.useRecoveryToken = true;

  // TODO: this should be configured by `newClient` and env variables
  clientOptions.useUnifiedTopology = true;

  const url = resolveConnectionString(configuration, spec);
  const client = configuration.newClient(url, clientOptions);
  return client.connect().then(client => {
    context.testClient = client;
    client.on('commandStarted', event => {
      if (IGNORED_COMMANDS.has(event.commandName)) {
        return;
      }

      context.commandEvents.push(event);

      // very useful for debugging
      if (displayCommands) {
        console.dir(event, { depth: 5 });
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

    const savedSessionData = {
      session0: JSON.parse(EJSON.stringify(session0.id)),
      session1: JSON.parse(EJSON.stringify(session1.id))
    };

    // enable to see useful APM debug information at the time of actual test run
    // displayCommands = true;

    const operationContext = {
      database,
      collectionName: context.collectionName,
      session0,
      session1,
      testRunner: context
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

        return validateExpectations(context.commandEvents, spec, savedSessionData);
      });
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
  expect(actualEvents).to.have.length(expectedEvents.length);

  expectedEvents.forEach((expected, idx) => {
    const actual = actualEvents[idx];

    if (expected.commandName != null) {
      expect(actual.commandName).to.equal(expected.commandName);
    }

    if (expected.databaseName != null) {
      expect(actual.databaseName).to.equal(expected.databaseName);
    }

    const actualCommand = actual.command;
    const expectedCommand = expected.command;

    expect(actualCommand)
      .withSessionData(savedSessionData)
      .to.matchMongoSpec(expectedCommand);
  });
}

function normalizeCommandShapes(commands) {
  return commands.map(command =>
    JSON.parse(
      EJSON.stringify(
        {
          command: command.command,
          commandName: command.command_name ? command.command_name : command.commandName,
          databaseName: command.database_name ? command.database_name : command.databaseName
        },
        { relaxed: true }
      )
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

function isTestRunnerCommand(context, commandName) {
  const testRunnerContext = context.testRunner;

  let methods = new Set();
  let object = testRunnerContext;
  do {
    if (object === Object.prototype) {
      break;
    }

    Object.getOwnPropertyNames(object)
      .filter(prop => typeof object[prop] === 'function' && prop !== 'constructor')
      .map(prop => methods.add(prop));
  } while ((object = Object.getPrototypeOf(object)));

  return methods.has(commandName);
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
  let args = [];
  const operationName = translateOperationName(operation.name);

  if (operation.arguments) {
    args = resolveOperationArgs(operationName, operation.arguments, context);

    if (args == null) {
      args = [];
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

        if ((key === 'map' || key === 'reduce') && operationName === 'mapReduce') {
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

  let opPromise;
  if (operationName === 'find' || operationName === 'aggregate') {
    // `find` creates a cursor, so we need to call `toArray` on it
    const cursor = obj[operationName].apply(obj, args);
    opPromise = cursor.toArray();
  } else {
    // wrap this in a `Promise.try` because some operations might throw
    opPromise = Promise.try(() => obj[operationName].apply(obj, args));
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
      result.errorContains ||
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

function testOperations(testData, operationContext, options) {
  options = options || { swallowOperationErrors: true };
  return testData.operations.reduce((combined, operation) => {
    return combined.then(() => {
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

      return testOperation(operation, operationContext[object], operationContext, options);
    });
  }, Promise.resolve());
}

module.exports = {
  TestRunnerContext,
  gatherTestSuites,
  generateTopologyTests
};
