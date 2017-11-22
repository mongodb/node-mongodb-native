'use strict';

var fs = require('fs');
var path = require('path');
var semver = require('semver');
var test = require('./shared').assert;
var assign = require('../../lib/utils').assign;

function findScenarios(type) {
  return fs
    .readdirSync(path.join(__dirname, 'spec', 'crud', type))
    .filter(x => {
      return x.indexOf('json') !== -1;
    })
    .map(x => {
      return [x, fs.readFileSync(path.join(__dirname, 'spec', 'crud', type, x), 'utf8')];
    })
    .map(x => {
      return [path.basename(x[0], '.json'), JSON.parse(x[1])];
    });
}

var readScenarios = findScenarios('read');
var writeScenarios = findScenarios('write');

var testContext = {};
describe('CRUD spec', function() {
  beforeEach(function() {
    var configuration = this.configuration;
    var MongoClient = configuration.require.MongoClient;
    return MongoClient.connect(configuration.url())
      .then(function(client) {
        testContext.client = client;
        testContext.db = client.db(configuration.db);

        return testContext.db.admin().command({ buildInfo: true });
      })
      .then(function(buildInfo) {
        testContext.mongodbVersion = buildInfo.version.split('-').shift();
      });
  });

  describe('read', function() {
    readScenarios.forEach(function(scenarioData) {
      var scenarioName = scenarioData[0];
      var scenario = scenarioData[1];
      scenario.name = scenarioName;

      describe(scenarioName, function() {
        scenario.tests.forEach(function(scenarioTest) {
          beforeEach(function() {
            return testContext.db.dropDatabase();
          });

          it(scenarioTest.description, {
            metadata: { requires: { topology: 'single' } },
            test: function() {
              if (
                !!scenario.minServerVersion &&
                !semver.satisfies(testContext.mongodbVersion, '>=' + scenario.minServerVersion)
              ) {
                this.skip();
                return;
              }

              return executeScenario(scenario, scenarioTest, this.configuration, testContext);
            }
          });
        });
      });
    });
  });

  describe('write', function() {
    writeScenarios.forEach(function(scenarioData) {
      var scenarioName = scenarioData[0];
      var scenario = scenarioData[1];
      scenario.name = scenarioName;

      describe(scenarioName, function() {
        beforeEach(function() {
          return testContext.db.dropDatabase();
        });

        scenario.tests.forEach(function(scenarioTest) {
          it(scenarioTest.description, {
            metadata: { requires: { topology: 'single' } },
            test: function() {
              if (
                !!scenario.minServerVersion &&
                !semver.satisfies(testContext.mongodbVersion, '>=' + scenario.minServerVersion)
              ) {
                this.skip();
                return;
              }

              return executeScenario(scenario, scenarioTest, this.configuration, testContext);
            }
          });
        });
      });
    });
  });

  function executeAggregateTest(scenarioTest, db, collection) {
    var options = {};
    if (scenarioTest.operation.arguments.collation) {
      options.collation = scenarioTest.operation.arguments.collation;
    }

    var pipeline = scenarioTest.operation.arguments.pipeline;
    return collection
      .aggregate(pipeline, options)
      .toArray()
      .then(function(results) {
        if (scenarioTest.outcome.collection) {
          return db
            .collection(scenarioTest.outcome.collection.name)
            .find({})
            .toArray()
            .then(function(collectionResults) {
              test.deepEqual(collectionResults, scenarioTest.outcome.result);
            });
        }

        test.deepEqual(results, scenarioTest.outcome.result);
        return Promise.resolve();
      });
  }

  function executeCountTest(scenarioTest, db, collection) {
    var args = scenarioTest.operation.arguments;
    var filter = args.filter;
    var options = assign({}, args);
    delete options.filter;

    return collection.count(filter, options).then(function(result) {
      test.equal(result, scenarioTest.outcome.result);
    });
  }

  function executeDistinctTest(scenarioTest, db, collection) {
    var args = scenarioTest.operation.arguments;
    var fieldName = args.fieldName;
    var options = assign({}, args);
    var filter = args.filter || {};
    delete options.fieldName;
    delete options.filter;

    return collection.distinct(fieldName, filter, options).then(function(result) {
      test.deepEqual(result, scenarioTest.outcome.result);
    });
  }

  function executeFindTest(scenarioTest, db, collection) {
    var args = scenarioTest.operation.arguments;
    var filter = args.filter;
    var options = assign({}, args);
    delete options.filter;

    return collection
      .find(filter, options)
      .toArray()
      .then(function(results) {
        test.deepEqual(results, scenarioTest.outcome.result);
      });
  }

  function executeDeleteTest(scenarioTest, db, collection) {
    // Unpack the scenario test
    var args = scenarioTest.operation.arguments;
    var filter = args.filter;
    var options = assign({}, args);
    delete options.filter;

    return collection[scenarioTest.operation.name](filter, options).then(function(result) {
      Object.keys(scenarioTest.outcome.result).forEach(function(resultName) {
        test.equal(result[resultName], scenarioTest.outcome.result[resultName]);
      });

      if (scenarioTest.outcome.collection) {
        return collection
          .find({})
          .toArray()
          .then(function(results) {
            test.deepEqual(results, scenarioTest.outcome.collection.data);
          });
      }
    });
  }

  function executeReplaceTest(scenarioTest, db, collection) {
    var args = scenarioTest.operation.arguments;
    var filter = args.filter;
    var replacement = args.replacement;
    var options = assign({}, args);
    delete options.filter;
    delete options.replacement;
    var opName = scenarioTest.operation.name;

    // Get the results
    return collection[opName](filter, replacement, options).then(function(result) {
      Object.keys(scenarioTest.outcome.result).forEach(function(resultName) {
        if (resultName === 'upsertedId') {
          test.equal(result[resultName]._id, scenarioTest.outcome.result[resultName]);
        } else {
          test.equal(result[resultName], scenarioTest.outcome.result[resultName]);
        }
      });

      if (scenarioTest.outcome.collection) {
        return collection
          .find({})
          .toArray()
          .then(function(results) {
            test.deepEqual(results, scenarioTest.outcome.collection.data);
          });
      }
    });
  }

  function executeUpdateTest(scenarioTest, db, collection) {
    var args = scenarioTest.operation.arguments;
    var filter = args.filter;
    var update = args.update;
    var options = assign({}, args);
    delete options.filter;
    delete options.update;

    return collection[scenarioTest.operation.name](filter, update, options).then(function(result) {
      Object.keys(scenarioTest.outcome.result).forEach(function(resultName) {
        if (resultName === 'upsertedId') {
          test.equal(result[resultName]._id, scenarioTest.outcome.result[resultName]);
        } else {
          test.equal(result[resultName], scenarioTest.outcome.result[resultName]);
        }
      });

      if (scenarioTest.outcome.collection) {
        return collection
          .find({})
          .toArray()
          .then(function(results) {
            test.deepEqual(results, scenarioTest.outcome.collection.data);
          });
      }
    });
  }

  function executeFindOneTest(scenarioTest, db, collection) {
    var args = scenarioTest.operation.arguments;
    var filter = args.filter;
    var second = args.update || args.replacement;
    var options = assign({}, args);
    if (options.returnDocument) {
      options.returnOriginal = options.returnDocument === 'After' ? false : true;
    }

    delete options.filter;
    delete options.update;
    delete options.replacement;
    delete options.returnDocument;

    var opName = scenarioTest.operation.name;
    var findPromise =
      opName === 'findOneAndDelete'
        ? collection[opName](filter, options)
        : collection[opName](filter, second, options);

    return findPromise.then(function(result) {
      if (scenarioTest.outcome.result) {
        test.deepEqual(result.value, scenarioTest.outcome.result);
      }

      if (scenarioTest.outcome.collection) {
        return collection
          .find({})
          .toArray()
          .then(function(results) {
            test.deepEqual(results, scenarioTest.outcome.collection.data);
          });
      }
    });
  }

  function executeScenario(scenario, scenarioTest, configuration, context) {
    var collection = context.db.collection(
      'crud_spec_tests_' + scenario.name + '_' + scenarioTest.operation.name
    );

    const errorHandler = err => {
      if (!err.message.match(/ns not found/)) throw err;
    };

    const dropPromises = [];
    dropPromises.push(collection.drop().catch(errorHandler));
    if (scenarioTest.outcome.collection && scenarioTest.outcome.collection.name) {
      dropPromises.push(
        context.db
          .collection(scenarioTest.outcome.collection.name)
          .drop()
          .catch(errorHandler)
      );
    }

    return Promise.all(dropPromises)
      .then(() => (scenario.data ? collection.insertMany(scenario.data) : Promise.resolve()))
      .then(() => {
        switch (scenarioTest.operation.name) {
          case 'aggregate':
            return executeAggregateTest(scenarioTest, context.db, collection);
          case 'count':
            return executeCountTest(scenarioTest, context.db, collection);
          case 'distinct':
            return executeDistinctTest(scenarioTest, context.db, collection);
          case 'find':
            return executeFindTest(scenarioTest, context.db, collection);
          case 'deleteOne':
          case 'deleteMany':
            return executeDeleteTest(scenarioTest, context.db, collection);
          case 'replaceOne':
            return executeReplaceTest(scenarioTest, context.db, collection);
          case 'updateOne':
          case 'updateMany':
            return executeUpdateTest(scenarioTest, context.db, collection);
          case 'findOneAndReplace':
          case 'findOneAndUpdate':
          case 'findOneAndDelete':
            return executeFindOneTest(scenarioTest, context.db, collection);
        }
      });
  }
});
