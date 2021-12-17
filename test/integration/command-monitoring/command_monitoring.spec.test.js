'use strict';

const { setupDatabase, filterOutCommands } = require('../shared');
const { loadSpecTests } = require('../../spec');
const { LEGACY_HELLO_COMMAND } = require('../../../src/constants');
const { expect } = require('chai');
const { runUnifiedTest } = require('../../tools/unified-spec-runner/runner');

describe('Command Monitoring spec tests', function () {
  describe('command monitoring legacy spec tests', function () {
    before(function () {
      return setupDatabase(this.configuration);
    });

    // TODO: The worst part about this custom validation method is that it does not
    //       provide the rich context of failure location that chai gives us out of
    //       the box. I investigated extending chai, however their internal implementation
    //       does not reuse other internal methods, so we'd have to bring lodash in.
    //       It may be worth seeing if we can improve on this, as we might need the
    //       behavior in other future YAML tests.
    const maybeLong = val => (typeof val.equals === 'function' ? val.toNumber() : val);
    function apmExpect(actual, expected, parentKey) {
      Object.keys(expected).forEach(key => {
        expect(actual).to.include.key(key);

        // TODO: This is a workaround that works because all sorts in the specs
        // are objects with one key; ideally we'd want to adjust the spec definitions
        // to indicate whether order matters for any given key and set general
        // expectations accordingly (see NODE-3235)
        if (key === 'sort') {
          expect(actual[key]).to.be.instanceOf(Map);
          expect(Object.keys(expected[key])).to.have.lengthOf(1);
          expect(actual[key].size).to.equal(1);
          expect(actual[key].get(Object.keys(expected[key])[0])).to.equal(
            Object.values(expected[key])[0]
          );
          return;
        }

        if (Array.isArray(expected[key])) {
          expect(actual[key]).to.be.instanceOf(Array);
          expect(actual[key]).to.have.lengthOf(expected[key].length);
          for (let i = 0; i < expected[key].length; ++i) {
            apmExpect(actual[key][i], expected[key][i], key);
          }

          return;
        }

        if (expected[key] === 42 || expected[key] === '42' || expected[key] === '') {
          if (key === 'code' && expected[key] === 42) {
            expect(actual[key]).to.be.greaterThan(0);
          }

          if (key === 'errmsg' && expected[key] === '') {
            expect(actual[key]).to.have.lengthOf.at.least(1); // >= 1
          }

          if (key === 'getmore' || (parentKey === 'cursor' && key === 'id')) {
            expect(maybeLong(actual[key])).to.be.greaterThan(0);
          }

          return;
        }

        // cheap isPlainObject clone
        if (Object.prototype.toString.call(expected[key]) === '[object Object]') {
          apmExpect(actual[key], expected[key], key);
          return;
        }

        // otherwise compare the values
        expect(maybeLong(actual[key]), key).to.deep.equal(expected[key]);
      });
    }

    function validateCommandStartedEvent(expected, event) {
      expect(event.commandName).to.equal(expected.command_name);
      expect(event.databaseName).to.equal(expected.database_name);
      apmExpect(event.command, expected.command);
    }

    function validateCommandSucceededEvent(expected, event) {
      expect(event.commandName).to.equal(expected.command_name);
      apmExpect(event.reply, expected.reply);
    }

    function validateCommandFailedEvent(expected, event) {
      expect(event.commandName).to.equal(expected.command_name);
    }

    function validateExpectations(expectation, results) {
      if (expectation.command_started_event) {
        validateCommandStartedEvent(expectation.command_started_event, results.starts.shift());
      } else if (expectation.command_succeeded_event) {
        validateCommandSucceededEvent(
          expectation.command_succeeded_event,
          results.successes.shift()
        );
      } else if (expectation.command_failed_event) {
        validateCommandFailedEvent(expectation.command_failed_event, results.failures.shift());
      }
    }

    function executeOperation(client, scenario, test) {
      // Get the operation
      const operation = test.operation;
      // Get the command name
      const commandName = operation.name;
      // Get the arguments
      const args = operation.arguments || {};
      // Get the database instance
      const db = client.db(scenario.database_name);
      // Get the collection
      const collection = db.collection(scenario.collection_name);
      // Parameters
      const params = [];
      // Options
      let options = null;
      // Get the data
      const data = scenario.data;
      // Command Monitoring context
      const monitoringResults = {
        successes: [],
        failures: [],
        starts: []
      };

      // Drop the collection
      return collection
        .drop()
        .catch(err => {
          // potentially skip this error
          if (!err.message.match(/ns not found/)) throw err;
        })
        .then(() => collection.insertMany(data))
        .then(r => {
          expect(data).to.have.length(Object.keys(r.insertedIds).length);

          // Set up the listeners
          client.on(
            'commandStarted',
            filterOutCommands([LEGACY_HELLO_COMMAND, 'endSessions'], monitoringResults.starts)
          );
          client.on(
            'commandFailed',
            filterOutCommands([LEGACY_HELLO_COMMAND, 'endSessions'], monitoringResults.failures)
          );
          client.on(
            'commandSucceeded',
            filterOutCommands([LEGACY_HELLO_COMMAND, 'endSessions'], monitoringResults.successes)
          );

          // Unpack the operation
          if (args.options) options = args.options;
          if (args.filter) params.push(args.filter);
          if (args.deletes) params.push(args.deletes);
          if (args.document) params.push(args.document);
          if (args.documents) params.push(args.documents);
          if (args.update) params.push(args.update);
          if (args.requests) {
            if (operation.name !== 'bulkWrite') {
              params.push(args.requests);
            } else {
              params.push(
                args.requests.map(r => {
                  return { [r.name]: r.arguments.document || r.arguments };
                })
              );
            }
          }

          if (args.writeConcern) {
            options = options || {};
            options.writeConcern = args.writeConcern;
          }

          if (typeof args.ordered === 'boolean') {
            if (options == null) {
              options = { ordered: args.ordered };
            } else {
              options.ordered = args.ordered;
            }
          }

          if (typeof args.upsert === 'boolean') {
            if (options == null) {
              options = { upsert: args.upsert };
            } else {
              options.upsert = args.upsert;
            }
          }

          // Find command is special needs to executed using toArray
          if (operation.name === 'find') {
            let cursor = collection[commandName]();

            // Set the options
            if (args.filter) cursor = cursor.filter(args.filter);
            if (args.batchSize) cursor = cursor.batchSize(args.batchSize);
            if (args.limit) cursor = cursor.limit(args.limit);
            if (args.skip) cursor = cursor.skip(args.skip);
            if (args.sort) cursor = cursor.sort(args.sort);

            // Set any modifiers
            if (args.modifiers) {
              for (let modifier in args.modifiers) {
                cursor.addQueryModifier(modifier, args.modifiers[modifier]);
              }
            }

            // Execute find
            return cursor
              .toArray()
              .catch(() => {} /* ignore */)
              .then(() =>
                test.expectations.forEach(expectation =>
                  validateExpectations(expectation, monitoringResults)
                )
              );
          }
          // Add options if they exists
          if (options) params.push(options);

          // Execute the operation
          const coll = operation.collectionOptions
            ? db.collection(scenario.collection_name, operation.collectionOptions)
            : db.collection(scenario.collection_name);

          const promise = coll[commandName].apply(coll, params);
          return promise
            .catch(() => {} /* ignore */)
            .then(() =>
              test.expectations.forEach(expectation =>
                validateExpectations(expectation, monitoringResults)
              )
            );
        });
    }

    loadSpecTests('command-monitoring/legacy').forEach(scenario => {
      if (scenario.name === 'command') return; // FIXME(NODE-3074): remove when `count` spec tests have been fixed
      describe(scenario.name, function () {
        scenario.tests.forEach(test => {
          const requirements = { topology: ['single', 'replicaset', 'sharded'] };
          if (test.ignore_if_server_version_greater_than) {
            requirements.mongodb = `<${test.ignore_if_server_version_greater_than}`;
          } else if (test.ignore_if_server_version_less_than) {
            requirements.mongodb = `>${test.ignore_if_server_version_less_than}`;
          }

          if (test.ignore_if_topology_type) {
            requirements.topology = requirements.topology.filter(
              top => test.ignore_if_topology_type.indexOf(top) < 0
            );
          }

          it(test.description, {
            metadata: { requires: requirements },
            test: function () {
              if (
                test.description ===
                'A successful find event with a getmore and the server kills the cursor'
              ) {
                this.skip();
              }

              const client = this.configuration.newClient({}, { monitorCommands: true });
              return client.connect().then(client => {
                expect(client).to.exist;
                return executeOperation(client, scenario, test).then(() => client.close());
              });
            }
          });
        });
      });
    });
  });

  describe('command monitoring unified spec tests', () => {
    for (const loadedSpec of loadSpecTests('command-monitoring/unified')) {
      expect(loadedSpec).to.include.all.keys(['description', 'tests']);
      context(String(loadedSpec.description), function () {
        for (const test of loadedSpec.tests) {
          it(String(test.description), {
            metadata: { sessions: { skipLeakTests: true } },
            test: async function () {
              await runUnifiedTest(this, loadedSpec, test);
            }
          });
        }
      });
    }
  });
});
