'use strict';

const Promise = require('bluebird');
const mongodb = require('../..');
const MongoClient = mongodb.MongoClient;
const path = require('path');
const fs = require('fs');
const chai = require('chai');
const expect = chai.expect;
const EJSON = require('mongodb-extjson');

// mlaunch init --replicaset --arbiter  --name rs --hostname localhost --port 31000 --binarypath /Users/mbroadst/Downloads/mongodb-osx-x86_64-enterprise-3.7.3-411-g91e4266/bin

chai.use(require('chai-subset'));
chai.config.includeStack = true;
chai.config.showDiff = true;
chai.config.truncateThreshold = 0;

const testContext = {
  dbName: 'transaction-tests',
  collectionName: 'test'
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && Array.isArray(value) === false;
}

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

      // NOTE: fix this, it just passes the current example
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

describe('Transactions (spec)', function() {
  const testSuites = fs
    .readdirSync(`${__dirname}/spec/transactions`)
    .filter(x => x.indexOf('.json') !== -1)
    .map(x =>
      Object.assign(JSON.parse(fs.readFileSync(`${__dirname}/spec/transactions/${x}`)), {
        name: path.basename(x, '.json')
      })
    );

  after(() => testContext.client.close());
  before(function() {
    // create a shared client for admin tasks
    const config = this.configuration;
    testContext.url = `mongodb://${config.host}:${config.port}/${testContext.dbName}?replicaSet=${
      config.replicasetName
    }`;

    testContext.client = new MongoClient(testContext.url);
    return testContext.client.connect();
  });

  testSuites.forEach(testSuite => {
    describe(testSuite.name, {
      metadata: { requires: { topology: ['replicaset', 'mongos'], mongodb: '>=3.7.x' } },
      test: function() {
        beforeEach(() => {
          const db = testContext.client.db();
          const coll = db.collection(testContext.collectionName);

          return coll
            .drop()
            .catch(err => {
              if (!err.message.match(/ns not found/)) throw err;
            })
            .then(() => db.createCollection(testContext.collectionName, { w: 'majority' }))
            .then(() => {
              if (testSuite.data && Array.isArray(testSuite.data) && testSuite.data.length > 0) {
                return coll.insert(testSuite.data, { w: 'majority' });
              }
            });
        });

        testSuite.tests.forEach(testData => {
          afterEach(() => {
            if (testContext.testClient) {
              return testContext.testClient.close().then(() => {
                delete testContext.testClient;
              });
            }
          });

          const maybeSkipIt = testData.skipReason ? it.skip : it;
          maybeSkipIt(testData.description, function() {
            const commandEvents = [];
            const clientOptions = translateClientOptions(
              Object.assign({ monitorCommands: true }, testData.clientOptions)
            );

            return MongoClient.connect(testContext.url, clientOptions).then(client => {
              testContext.testClient = client;
              client.on('commandStarted', event => {
                if (
                  event.databaseName === testContext.dbName ||
                  ['startTransaction', 'commitTransaction', 'abortTransaction'].includes(
                    event.commandName
                  )
                ) {
                  // console.dir(event, { depth: null });
                  commandEvents.push(event);
                }
              });

              const sessionOptions = Object.assign({}, testData.transactionOptions);

              testData.sessionOptions = testData.sessionOptions || {};
              const session0 = client.startSession(
                Object.assign({}, sessionOptions, testData.sessionOptions.session0)
              );
              const session1 = client.startSession(
                Object.assign({}, sessionOptions, testData.sessionOptions.session1)
              );

              return testOperations(client, testData, { session0, session1 })
                .catch(err => {
                  // If the driver throws an exception / returns an error while executing this series
                  // of operations, store the error message.
                  // console.log('error occurred during series of operations');
                  // console.dir(err);
                  // operationError = err;
                  throw err;
                })
                .then(() => {
                  session0.endSession();
                  session1.endSession();

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
                      return testContext.client
                        .db()
                        .collection(testContext.collectionName)
                        .find({})
                        .toArray()
                        .then(docs => {
                          expect(docs).to.eql(testData.outcome.collection.data);
                        });
                    }
                  }
                });
            });
          });
        });
      }
    });
  });
});

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
  return ['startTransaction', 'commitTransaction', 'abortTransaction'].includes(command);
}

function extractBulkRequests(requests) {
  return requests.map(request => ({ [request.name]: request.arguments }));
}

/**
 *
 * @param {Object} operation the operation definition from the spec test
 * @param {Object} obj the object to call the operation on
 * @param {Object} context a context object containing sessions used for the test
 */
function testOperation(operation, obj, context) {
  // console.log('testing operation: ', operation.name);

  const opOptions = {};
  const args = [];
  if (operation.arguments) {
    Object.keys(operation.arguments).forEach(key => {
      if (['filter', 'fieldName', 'document', 'documents'].includes(key)) {
        return args.unshift(operation.arguments[key]);
      }

      if (key === 'requests') return args.unshift(extractBulkRequests(operation.arguments[key]));
      if (key === 'update' || key === 'replacement') return args.push(operation.arguments[key]);
      if (key === 'session') {
        if (isTransactionCommand(operation.name)) return;
        opOptions.session = context[operation.arguments.session];
        return;
      }

      if (key === 'returnDocument') {
        opOptions.returnOriginal = operation.arguments[key] === 'Before' ? true : false;
        return;
      }

      opOptions[key] = operation.arguments[key];
    });
  }

  if (args.length === 0 && !isTransactionCommand(operation.name)) {
    args.push({});
  }

  if (Object.keys(opOptions).length > 0) {
    // NOTE: this is awful, but in order to provide options for some methods we need to add empty
    //       query objects.
    if (operation.name === 'distinct') {
      args.push({});
    }

    args.push(opOptions);
  }

  let opPromise;
  if (operation.name === 'find') {
    // `find` creates a cursor, so we need to call `toArray` on it
    const cursor = obj[operation.name].apply(obj, args);
    opPromise = cursor.toArray();
  } else if (operation.name === 'startTransaction') {
    // `startTansaction` can throw, so we need to make sure we wrap it in a promise
    opPromise = Promise.try(() => obj[operation.name].apply(obj, args));
  } else {
    opPromise = obj[operation.name].apply(obj, args);
  }

  if (operation.result) {
    if (operation.result.errorContains || operation.result.errorCodeName) {
      return opPromise
        .then(() => {
          throw new Error('expected an error!');
        })
        .catch(err => {
          if (operation.result.errorContains) {
            expect(err).to.match(new RegExp(operation.result.errorContains, 'i'));
          } else {
            expect(err.codeName).to.equal(operation.result.errorCodeName);
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

function testOperations(client, testData, context) {
  const coll = client.db().collection('test');
  return testData.operations.reduce((combined, operation) => {
    if (isTransactionCommand(operation.name)) {
      const session = context[operation.arguments.session];
      return combined.then(() => testOperation(operation, session, context));
    }

    return combined.then(() => testOperation(operation, coll, context));
  }, Promise.resolve());
}
