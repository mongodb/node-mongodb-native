'use strict';

const fs = require('fs');
const path = require('path');
const test = require('./shared').assert;

function findScenarios(type) {
  return fs
    .readdirSync(path.join(__dirname, 'spec', 'crud', type))
    .filter(x => x.indexOf('json') !== -1)
    .map(x => [x, fs.readFileSync(path.join(__dirname, 'spec', 'crud', type, x), 'utf8')])
    .map(x => [path.basename(x[0], '.json'), JSON.parse(x[1])]);
}

const readScenarios = findScenarios('read');
const writeScenarios = findScenarios('write');

const testContext = {};
describe('CRUD spec', function() {
  beforeEach(function() {
    const configuration = this.configuration;
    const MongoClient = configuration.require.MongoClient;
    return MongoClient.connect(configuration.url()).then(client => {
      testContext.client = client;
      testContext.db = client.db(configuration.db);
    });
  });

  afterEach(() => {
    if (testContext.client) {
      testContext.client.close();
    }
  });

  describe('read', function() {
    readScenarios.forEach(scenarioData => {
      const scenarioName = scenarioData[0];
      const scenario = scenarioData[1];
      scenario.name = scenarioName;

      describe(scenarioName, function() {
        scenario.tests.forEach(scenarioTest => {
          beforeEach(() => testContext.db.dropDatabase());
          it(scenarioTest.description, {
            metadata: {
              requires: {
                topology: ['single', 'replicaset', 'sharded'],
                mongodb: `>=${scenario.minServerVersion}`
              }
            },
            test: function() {
              return executeScenario(scenario, scenarioTest, this.configuration, testContext);
            }
          });
        });
      });
    });
  });

  describe('write', function() {
    writeScenarios.forEach(scenarioData => {
      const scenarioName = scenarioData[0];
      const scenario = scenarioData[1];
      scenario.name = scenarioName;

      describe(scenarioName, function() {
        beforeEach(() => testContext.db.dropDatabase());

        scenario.tests.forEach(scenarioTest => {
          it(scenarioTest.description, {
            metadata: {
              requires: {
                topology: ['single', 'replicaset', 'sharded'],
                mongodb: `>=${scenario.minServerVersion}`
              }
            },
            test: function() {
              return executeScenario(scenario, scenarioTest, this.configuration, testContext);
            }
          });
        });
      });
    });
  });

  function executeAggregateTest(scenarioTest, db, collection) {
    const options = {};
    if (scenarioTest.operation.arguments.collation) {
      options.collation = scenarioTest.operation.arguments.collation;
    }

    const pipeline = scenarioTest.operation.arguments.pipeline;
    return collection
      .aggregate(pipeline, options)
      .toArray()
      .then(results => {
        if (scenarioTest.outcome.collection) {
          return db
            .collection(scenarioTest.outcome.collection.name)
            .find({})
            .toArray()
            .then(collectionResults =>
              test.deepEqual(collectionResults, scenarioTest.outcome.result)
            );
        }

        test.deepEqual(results, scenarioTest.outcome.result);
        return Promise.resolve();
      });
  }

  function executeCountTest(scenarioTest, db, collection) {
    const args = scenarioTest.operation.arguments;
    const filter = args.filter;
    const options = Object.assign({}, args);
    delete options.filter;

    return collection
      .count(filter, options)
      .then(result => test.equal(result, scenarioTest.outcome.result));
  }

  function executeDistinctTest(scenarioTest, db, collection) {
    const args = scenarioTest.operation.arguments;
    const fieldName = args.fieldName;
    const options = Object.assign({}, args);
    const filter = args.filter || {};
    delete options.fieldName;
    delete options.filter;

    return collection
      .distinct(fieldName, filter, options)
      .then(result => test.deepEqual(result, scenarioTest.outcome.result));
  }

  function executeFindTest(scenarioTest, db, collection) {
    const args = scenarioTest.operation.arguments;
    const filter = args.filter;
    const options = Object.assign({}, args);
    delete options.filter;

    return collection
      .find(filter, options)
      .toArray()
      .then(results => test.deepEqual(results, scenarioTest.outcome.result));
  }

  function executeDeleteTest(scenarioTest, db, collection) {
    // Unpack the scenario test
    const args = scenarioTest.operation.arguments;
    const filter = args.filter;
    const options = Object.assign({}, args);
    delete options.filter;

    return collection[scenarioTest.operation.name](filter, options).then(result => {
      Object.keys(scenarioTest.outcome.result).forEach(resultName =>
        test.equal(result[resultName], scenarioTest.outcome.result[resultName])
      );

      if (scenarioTest.outcome.collection) {
        return collection
          .find({})
          .toArray()
          .then(results => test.deepEqual(results, scenarioTest.outcome.collection.data));
      }
    });
  }

  function executeInsertTest(scenarioTest, db, collection) {
    const args = scenarioTest.operation.arguments;
    const documents = args.document || args.documents;
    let options = Object.assign({}, args);
    delete options.document;
    delete options.documents;

    return collection[scenarioTest.operation.name](documents, options).then(result => {
      Object.keys(scenarioTest.outcome.result).forEach(resultName =>
        test.deepEqual(result[resultName], scenarioTest.outcome.result[resultName])
      );

      if (scenarioTest.outcome.collection) {
        return collection
          .find({})
          .toArray()
          .then(results => test.deepEqual(results, scenarioTest.outcome.collection.data));
      }
    });
  }

  function executeBulkTest(scenarioTest, db, collection) {
    const args = scenarioTest.operation.arguments;
    const operations = args.requests.map(operation => {
      let op = {};
      op[operation.name] = operation['arguments'];
      return op;
    });
    const options = Object.assign({}, args.options);

    collection
      .bulkWrite(operations, options)
      .then(result =>
        Object.keys(scenarioTest.outcome.result).forEach(resultName =>
          test.deepEqual(result[resultName], scenarioTest.outcome.result[resultName])
        )
      );

    return collection
      .find({})
      .toArray()
      .then(results => test.deepEqual(results, scenarioTest.outcome.collection.data));
  }

  function executeReplaceTest(scenarioTest, db, collection) {
    const args = scenarioTest.operation.arguments;
    const filter = args.filter;
    const replacement = args.replacement;
    const options = Object.assign({}, args);
    delete options.filter;
    delete options.replacement;
    const opName = scenarioTest.operation.name;

    // Get the results
    return collection[opName](filter, replacement, options).then(result => {
      Object.keys(scenarioTest.outcome.result).forEach(resultName => {
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
          .then(results => test.deepEqual(results, scenarioTest.outcome.collection.data));
      }
    });
  }

  function executeUpdateTest(scenarioTest, db, collection) {
    const args = scenarioTest.operation.arguments;
    const filter = args.filter;
    const update = args.update;
    const options = Object.assign({}, args);
    delete options.filter;
    delete options.update;

    return collection[scenarioTest.operation.name](filter, update, options).then(result => {
      Object.keys(scenarioTest.outcome.result).forEach(resultName => {
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
          .then(results => test.deepEqual(results, scenarioTest.outcome.collection.data));
      }
    });
  }

  function executeFindOneTest(scenarioTest, db, collection) {
    const args = scenarioTest.operation.arguments;
    const filter = args.filter;
    const second = args.update || args.replacement;
    const options = Object.assign({}, args);
    if (options.returnDocument) {
      options.returnOriginal = options.returnDocument === 'After' ? false : true;
    }

    delete options.filter;
    delete options.update;
    delete options.replacement;
    delete options.returnDocument;

    const opName = scenarioTest.operation.name;
    const findPromise =
      opName === 'findOneAndDelete'
        ? collection[opName](filter, options)
        : collection[opName](filter, second, options);

    return findPromise.then(result => {
      if (scenarioTest.outcome.result) {
        test.deepEqual(result.value, scenarioTest.outcome.result);
      }

      if (scenarioTest.outcome.collection) {
        return collection
          .find({})
          .toArray()
          .then(results => test.deepEqual(results, scenarioTest.outcome.collection.data));
      }
    });
  }

  function executeScenario(scenario, scenarioTest, configuration, context) {
    const collection = context.db.collection(
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
          case 'insertOne':
          case 'insertMany':
            return executeInsertTest(scenarioTest, context.db, collection);
          case 'bulkWrite':
            return executeBulkTest(scenarioTest, context.db, collection);
        }
      });
  }
});
