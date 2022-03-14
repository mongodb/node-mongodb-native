'use strict';

const path = require('path');
const { expect } = require('chai');
const { loadSpecTests } = require('../../spec');
const { runUnifiedSuite } = require('../../tools/unified-spec-runner/runner');
const camelCase = require('lodash.camelcase');
const { LEGACY_HELLO_COMMAND } = require('../../../src/constants');
const { delay, setupDatabase } = require('../shared');

describe('Change Streams Spec - Unified', function () {
  runUnifiedSuite(loadSpecTests(path.join('change-streams', 'unified')), [
    'Test with document comment',
    'Test with string comment',
    'Test that comment is set on getMore'
  ]);
});

// TODO: NODE-3819: Unskip flaky MacOS tests.
const maybeDescribe = process.platform === 'darwin' ? describe.skip : describe;
maybeDescribe('Change Stream Spec - v1', function () {
  let globalClient;
  let ctx;
  let events;

  const TESTS_TO_SKIP = new Set([]);

  before(function () {
    const configuration = this.configuration;
    return setupDatabase(configuration).then(() => {
      globalClient = configuration.newClient();
      return globalClient.connect();
    });
  });

  after(function () {
    const gc = globalClient;
    globalClient = undefined;
    return new Promise(r => gc.close(() => r()));
  });

  loadSpecTests(path.join('change-streams', 'legacy')).forEach(suite => {
    const ALL_DBS = [suite.database_name, suite.database2_name];

    describe(suite.name, () => {
      beforeEach(function () {
        const gc = globalClient;
        const sDB = suite.database_name;
        const sColl = suite.collection_name;
        const configuration = this.configuration;
        return Promise.all(
          ALL_DBS.map(db => gc.db(db).dropDatabase({ writeConcern: { w: 'majority' } }))
        )
          .then(() => gc.db(sDB).createCollection(sColl))
          .then(() => {
            if (suite.database2_name && suite.collection2_name) {
              return gc.db(suite.database2_name).createCollection(suite.collection2_name);
            }
          })
          .then(() =>
            configuration
              .newClient({}, { monitorCommands: true, heartbeatFrequencyMS: 100 })
              .connect()
          )
          .then(client => {
            ctx = { gc, client };
            events = [];
            const _events = events;

            ctx.database = ctx.client.db(sDB);
            ctx.collection = ctx.database.collection(sColl);
            ctx.client.on('commandStarted', e => {
              if (e.commandName !== LEGACY_HELLO_COMMAND) _events.push(e);
            });
          });
      });

      afterEach(function () {
        const client = ctx.client;
        ctx = undefined;
        events = undefined;

        client.removeAllListeners('commandStarted');

        return client && client.close(true);
      });

      suite.tests.forEach(test => {
        const shouldSkip = test.skip || TESTS_TO_SKIP.has(test.description);
        // There's no evidence of test.only being defined in the spec files
        // But let's avoid removing it now to just be sure we aren't changing anything
        // These tests will eventually be replaced by unified format versions.
        const itFn = shouldSkip ? it.skip : test.only ? Reflect.get(it, 'only') : it;
        const metadata = generateMetadata(test);
        const testFn = generateTestFn(test);

        itFn(test.description, { metadata, test: testFn });
      });
    });
  });

  // Fn Generator methods

  function generateMetadata(test) {
    const topology = test.topology;
    const requires = {};
    const versionLimits = [];
    if (test.minServerVersion) {
      versionLimits.push(`>=${test.minServerVersion}`);
    }
    if (test.maxServerVersion) {
      versionLimits.push(`<=${test.maxServerVersion}`);
    }
    if (versionLimits.length) {
      requires.mongodb = versionLimits.join(' ');
    }

    if (topology) {
      requires.topology = topology;
    }

    return { requires };
  }

  function generateTestFn(test) {
    const configureFailPoint = makeFailPointCommand(test);
    const testFnRunOperations = makeTestFnRunOperations(test);
    const testSuccess = makeTestSuccess(test);
    const testFailure = makeTestFailure(test);
    const testAPM = makeTestAPM(test);

    return function testFn() {
      return configureFailPoint(ctx)
        .then(() => testFnRunOperations(ctx))
        .then(testSuccess, testFailure)
        .then(() => testAPM(ctx, events));
    };
  }

  function makeFailPointCommand(test) {
    if (!test.failPoint) {
      return () => Promise.resolve();
    }

    return function (ctx) {
      return ctx.gc.db('admin').command(test.failPoint);
    };
  }

  function makeTestSuccess(test) {
    const result = test.result;

    return function testSuccess(value) {
      if (result.error) {
        throw new Error(`Expected test to return error ${result.error}`);
      }

      if (result.success) {
        expect(value).to.have.a.lengthOf(result.success.length);
        expect(value).to.matchMongoSpec(result.success);
      }
    };
  }

  function makeTestFailure(test) {
    const result = test.result;

    return function testFailure(err) {
      if (!result.error) {
        throw err;
      }

      expect(err).to.matchMongoSpec(result.error);
    };
  }

  function makeTestAPM(test) {
    const expectedEvents = test.expectations || [];

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
          // killCursors events should be skipped
          // (see https://github.com/mongodb/specifications/blob/master/source/change-streams/tests/README.rst#spec-test-runner)
          if (events[idx].commandName === 'killCursors') {
            return;
          }
          expect(events[idx]).to.matchMongoSpec(expected);
        });
    };
  }

  function allSettled(promises) {
    let err;
    return Promise.all(promises.map(p => p.catch(x => (err = err || x)))).then(args => {
      if (err) {
        throw err;
      }
      return args;
    });
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

      return allSettled([changeStreamPromise, operationsPromise]).then(args => args[0]);
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

    return changeStreamPromise.then(
      result => close(null, result),
      err => close(err)
    );
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
});
