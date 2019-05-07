'use strict';

const EJSON = require('mongodb-extjson');
const chai = require('chai');
const fs = require('fs');
const camelCase = require('lodash.camelcase');
const setupDatabase = require('./shared').setupDatabase;
const delay = require('./shared').delay;
const expect = chai.expect;

describe('Change Stream Spec', function() {
  const EJSONToJSON = x => JSON.parse(EJSON.stringify(x));

  let globalClient;
  let ctx;
  let events;

  before(function() {
    const configuration = this.configuration;
    return setupDatabase(configuration).then(() => {
      globalClient = configuration.newClient();
      return globalClient.connect();
    });
  });

  after(function() {
    const gc = globalClient;
    globalClient = undefined;
    return new Promise(r => gc.close(() => r()));
  });

  fs
    .readdirSync(`${__dirname}/spec/change-stream`)
    .filter(filename => filename.match(/\.json$/))
    .forEach(filename => {
      const specString = fs.readFileSync(`${__dirname}/spec/change-stream/${filename}`, 'utf8');
      const specData = JSON.parse(specString);

      const ALL_DBS = [specData.database_name, specData.database2_name];

      describe(filename, () => {
        beforeEach(function() {
          const gc = globalClient;
          const sDB = specData.database_name;
          const sColl = specData.collection_name;
          const configuration = this.configuration;
          return Promise.all(ALL_DBS.map(db => gc.db(db).dropDatabase({ w: 'majority' })))
            .then(() => gc.db(sDB).createCollection(sColl))
            .then(() => gc.db(specData.database2_name).createCollection(specData.collection2_name))
            .then(() => configuration.newClient({}, { monitorCommands: true }).connect())
            .then(client => {
              ctx = { gc, client };
              events = [];
              const _events = events;

              ctx.database = ctx.client.db(sDB);
              ctx.collection = ctx.database.collection(sColl);
              ctx.client.on('commandStarted', e => _events.push(e));
            });
        });

        afterEach(function() {
          const client = ctx.client;
          ctx = undefined;
          events = undefined;

          return client && client.close();
        });

        specData.tests.forEach(test => {
          const itFn = test.skip ? it.skip : test.only ? it.only : it;
          const metadata = generateMetadata(test);
          const testFn = generateTestFn(test);

          itFn(test.description, { metadata, test: testFn });
        });
      });
    });

  // Fn Generator methods

  function generateMetadata(test) {
    const mongodb = test.minServerVersion;
    const topology = test.topology;
    const requires = {};
    if (mongodb) {
      requires.mongodb = `>=${mongodb}`;
    }
    if (topology) {
      requires.topology = topology;
    }

    return { requires };
  }

  function generateTestFn(test) {
    const testFnRunOperations = makeTestFnRunOperations(test);
    const testSuccess = makeTestSuccess(test);
    const testFailure = makeTestFailure(test);
    const testAPM = makeTestAPM(test);

    return function testFn() {
      return testFnRunOperations(ctx)
        .then(testSuccess, testFailure)
        .then(() => testAPM(ctx, events));
    };
  }

  function makeTestSuccess(test) {
    const result = test.result;

    return function testSuccess(value) {
      if (result.error) {
        throw new Error(`Expected test to return error ${result.error}`);
      }

      if (result.success) {
        value = EJSONToJSON(value);
        assertEquality(value, result.success);
      }
    };
  }

  function makeTestFailure(test) {
    const result = test.result;

    return function testFailure(err) {
      if (!result.error) {
        throw err;
      }

      assertEquality(err, result.error);
    };
  }

  function makeTestAPM(test) {
    const expectedEvents = test.expectations;

    return function testAPM(ctx, events) {
      expectedEvents
        .map(e => e.command_started_event)
        .map(normalizeAPMEvent)
        .forEach((expected, idx) => {
          if (!events[idx]) {
            throw new Error(
              `Expected there to be an APM event at index ${idx}, but there was none`
            );
          }
          const actual = EJSONToJSON(events[idx]);
          assertEquality(actual, expected);
        });
    };
  }

  function makeTestFnRunOperations(test) {
    const target = test.target;
    const operations = test.operations;
    const success = test.result.success || [];

    return function testFnRunOperations(ctx) {
      const changeStreamPipeline = test.changeStreamPipeline;
      const changeStreamOptions = test.changeStreamOptions;
      ctx.changeStream = ctx[target].watch(changeStreamPipeline, changeStreamOptions);

      const changeStreamPromise = readAndCloseChangeStream(ctx.changeStream, success.length);
      const operationsPromise = runOperations(ctx.gc, operations);

      return Promise.all([changeStreamPromise, operationsPromise]).then(args => args[0]);
    };
  }

  function readAndCloseChangeStream(changeStream, numChanges) {
    const close = makeChangeStreamCloseFn(changeStream);
    let changeStreamPromise = changeStream.next().then(r => [r]);

    for (let i = 1; i < numChanges; i += 1) {
      changeStreamPromise = changeStreamPromise.then(results => {
        return changeStream.next().then(result => {
          results.push(result);
          return results;
        });
      });
    }

    return changeStreamPromise.then(result => close(null, result), err => close(err));
  }

  function runOperations(client, operations) {
    return operations
      .map(op => makeOperation(client, op))
      .reduce((p, op) => p.then(op), delay(200));
  }

  function makeChangeStreamCloseFn(changeStream) {
    return function close(error, value) {
      return new Promise((resolve, reject) => {
        changeStream.close(err => {
          if (error || err) {
            return reject(error || err);
          }
          return resolve(value);
        });
      });
    };
  }

  function normalizeAPMEvent(raw) {
    return Object.keys(raw).reduce((agg, key) => {
      agg[camelCase(key)] = raw[key];
      return agg;
    }, {});
  }

  function makeOperation(client, op) {
    const target = client.db(op.database).collection(op.collection);
    const command = op.name;
    const args = [];
    if (op.arguments) {
      if (op.arguments.document) {
        args.push(op.arguments.document);
      }
      if (op.arguments.filter) {
        args.push(op.arguments.filter);
      }
      if (op.arguments.update) {
        args.push(op.arguments.update);
      }
      if (op.arguments.replacement) {
        args.push(op.arguments.replacement);
      }
      if (op.arguments.to) {
        args.push(op.arguments.to);
      }
    }
    return () => target[command].apply(target, args);
  }

  function assertEquality(actual, expected) {
    try {
      _assertEquality(actual, expected);
    } catch (e) {
      console.dir(actual, { depth: 999 });
      console.dir(expected, { depth: 999 });
      throw e;
    }
  }

  function _assertEquality(actual, expected) {
    try {
      if (expected === '42' || expected === 42) {
        expect(actual).to.exist;
        return;
      }

      const expectedType =
        expected && expected.code ? 'error' : Array.isArray(expected) ? 'array' : typeof expected;
      expect(actual).to.be.a(expectedType);

      if (expected == null) {
        expect(actual).to.not.exist;
      } else if (Array.isArray(expected)) {
        expected.forEach((ex, idx) => _assertEquality(actual[idx], ex));
      } else if (typeof expected === 'object') {
        for (let i in expected) {
          _assertEquality(actual[i], expected[i]);
        }
      } else {
        expect(actual).to.equal(expected);
      }
    } catch (e) {
      throw e;
    }
  }
});
