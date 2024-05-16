import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

import { loadSpecTests } from '../../spec/index';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

function enforceServerVersionLimits(requires, scenario) {
  const versionLimits: string[] = [];
  if (scenario.minServerVersion) {
    versionLimits.push(`>=${scenario.minServerVersion}`);
  }
  if (scenario.maxServerVersion) {
    versionLimits.push(`<=${scenario.maxServerVersion}`);
  }
  if (versionLimits.length) {
    requires.mongodb = versionLimits.join(' ');
  }
  if (scenario.serverless) {
    requires.serverless = scenario.serverless;
  }
}
function findScenarios(...args: string[]) {
  const route = [__dirname, '..', '..', 'spec', 'crud'].concat(Array.from(args));
  return fs
    .readdirSync(path.resolve(...route))
    .filter(x => x.indexOf('json') !== -1)
    .map(x => [x, fs.readFileSync(path.resolve(...route.concat([x])), 'utf8')])
    .map(x => [path.basename(x[0], '.json'), JSON.parse(x[1])]);
}
const readScenarios = findScenarios('v1', 'read');
const writeScenarios = findScenarios('v1', 'write');
const testContext = {};
describe('CRUD spec v1', function () {
  beforeEach(function () {
    const configuration = this.configuration;
    const client = configuration.newClient();
    return client.connect().then(client => {
      testContext.client = client;
      testContext.db = client.db(configuration.db);
    });
  });

  afterEach(() => {
    if (testContext.client) {
      return testContext.client.close();
    }
  });

  describe('read', function () {
    readScenarios.forEach(scenarioData => {
      const scenarioName = scenarioData[0];
      const scenario = scenarioData[1];
      scenario.name = scenarioName;
      const metadata = {
        requires: {
          topology: ['single', 'replicaset', 'sharded']
        }
      };
      enforceServerVersionLimits(metadata.requires, scenario);
      describe(scenarioName, function () {
        scenario.tests.forEach(scenarioTest => {
          beforeEach(() => testContext.db.dropDatabase());
          it(scenarioTest.description, metadata, function () {
            return executeScenario(scenario, scenarioTest, this.configuration, testContext);
          });
        });
      });
    });
  });

  describe('write', function () {
    writeScenarios.forEach(scenarioData => {
      const scenarioName = scenarioData[0];
      const scenario = scenarioData[1];
      scenario.name = scenarioName;
      const metadata = {
        requires: {
          topology: ['single', 'replicaset', 'sharded']
        }
      };
      enforceServerVersionLimits(metadata.requires, scenario);
      describe(scenarioName, function () {
        beforeEach(() => testContext.db.dropDatabase());
        scenario.tests.forEach(scenarioTest => {
          it(scenarioTest.description, metadata, function () {
            return executeScenario(scenario, scenarioTest, this.configuration, testContext);
          });
        });
      });
    });
  });
  function invert(promise) {
    return promise.then(
      () => {
        throw new Error('Expected operation to throw an error');
      },
      e => e
    );
  }
  function assertWriteExpectations(collection, outcome) {
    return function (result) {
      Object.keys(outcome.result).forEach(resultName => {
        expect(result).to.have.property(resultName);
        expect(result[resultName]).to.containSubset(outcome.result[resultName]);
      });
      if (collection && outcome.collection && outcome.collection.data) {
        return collection
          .find({})
          .toArray()
          .then(results => {
            expect(results).to.containSubset(outcome.collection.data);
          });
      }
    };
  }
  function assertReadExpectations(db, collection, outcome) {
    return function (result) {
      if (outcome.result && !outcome.collection) {
        expect(result).to.containSubset(outcome.result);
      }
      if (collection && outcome.collection) {
        if (outcome.collection.name) {
          return db
            .collection(outcome.collection.name)
            .find({})
            .toArray()
            .then(collectionResults => {
              expect(collectionResults).to.containSubset(outcome.collection.data);
            });
        }
        return collection
          .find({})
          .toArray()
          .then(results => {
            expect(results).to.containSubset(outcome.collection.data);
          });
      }
    };
  }
  function executeAggregateTest(scenarioTest, db, collection) {
    const options = {};
    if (scenarioTest.operation.arguments.collation) {
      options.collation = scenarioTest.operation.arguments.collation;
    }
    const pipeline = scenarioTest.operation.arguments.pipeline;
    return collection
      .aggregate(pipeline, options)
      .toArray()
      .then(assertReadExpectations(db, collection, scenarioTest.outcome));
  }
  function executeCountTest(scenarioTest, db, collection) {
    const args = scenarioTest.operation.arguments;
    const filter = args.filter;
    const options = Object.assign({}, args);
    delete options.filter;
    return collection
      .count(filter, options)
      .then(assertReadExpectations(db, collection, scenarioTest.outcome));
  }
  function executeCountDocumentsTest(scenarioTest, db, collection) {
    const args = scenarioTest.operation.arguments;
    const filter = args.filter;
    const options = Object.assign({}, args);
    delete options.filter;
    return collection
      .countDocuments(filter, options)
      .then(assertReadExpectations(db, collection, scenarioTest.outcome));
  }
  function executeEstimatedDocumentCountTest(scenarioTest, db, collection) {
    const args = scenarioTest.operation.arguments;
    const options = Object.assign({}, args);
    delete options.filter;
    return collection
      .estimatedDocumentCount(options)
      .then(assertReadExpectations(db, collection, scenarioTest.outcome));
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
      .then(assertReadExpectations(db, collection, scenarioTest.outcome));
  }
  function executeFindTest(scenarioTest, db, collection) {
    const args = scenarioTest.operation.arguments;
    const filter = args.filter;
    const options = Object.assign({}, args);
    delete options.filter;
    return collection
      .find(filter, options)
      .toArray()
      .then(assertReadExpectations(db, collection, scenarioTest.outcome));
  }
  function executeDeleteTest(scenarioTest, db, collection) {
    // Unpack the scenario test
    const args = scenarioTest.operation.arguments;
    const filter = args.filter;
    const options = Object.assign({}, args);
    delete options.filter;
    return collection[scenarioTest.operation.name](filter, options).then(
      assertWriteExpectations(collection, scenarioTest.outcome)
    );
  }
  function executeInsertTest(scenarioTest, db, collection) {
    const args = scenarioTest.operation.arguments;
    const documents = args.document || args.documents;
    const options = Object.assign({}, args.options);
    delete options.document;
    delete options.documents;
    let promise = collection[scenarioTest.operation.name](documents, options);
    const outcome = scenarioTest.outcome;
    if (outcome.error) {
      promise = invert(promise);
    }
    return promise.then(assertWriteExpectations(collection, scenarioTest.outcome));
  }
  function executeBulkTest(scenarioTest, db, collection) {
    const args = scenarioTest.operation.arguments;
    const operations = args.requests.map(operation => {
      const op = {};
      op[operation.name] = operation['arguments'];
      if (operation['arguments'].collation) {
        op.collation = operation['arguments'].collation;
      }
      return op;
    });
    const options = Object.assign({}, args.options);
    let promise = collection.bulkWrite(operations, options);
    const outcome = scenarioTest.outcome;
    if (outcome.error) {
      promise = invert(promise);
    }
    return promise.then(assertWriteExpectations(collection, scenarioTest.outcome));
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
    return collection[opName](filter, replacement, options).then(
      assertWriteExpectations(collection, scenarioTest.outcome)
    );
  }
  function executeUpdateTest(scenarioTest, db, collection) {
    const args = scenarioTest.operation.arguments;
    const filter = args.filter;
    const update = args.update;
    const options = Object.assign({}, args);
    delete options.filter;
    delete options.update;
    return collection[scenarioTest.operation.name](filter, update, options).then(
      assertWriteExpectations(collection, scenarioTest.outcome)
    );
  }
  function executeFindOneTest(scenarioTest, db, collection) {
    const args = scenarioTest.operation.arguments;
    const filter = args.filter;
    const second = args.update || args.replacement;
    const options = Object.assign({}, args);
    if (options.returnDocument) {
      options.returnDocument = options.returnDocument.toLowerCase();
    }
    delete options.filter;
    delete options.update;
    delete options.replacement;
    const opName = scenarioTest.operation.name;
    const findPromise =
      opName === 'findOneAndDelete'
        ? collection[opName](filter, options)
        : collection[opName](filter, second, options);
    return findPromise.then(assertReadExpectations(db, collection, scenarioTest.outcome));
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
        context.db.collection(scenarioTest.outcome.collection.name).drop().catch(errorHandler)
      );
    }
    function promiseTry(callback) {
      return new Promise((resolve, reject) => {
        try {
          resolve(callback());
        } catch (e) {
          reject(e);
        }
      });
    }
    const outcome = scenarioTest.outcome;
    return Promise.all(dropPromises)
      .then(() =>
        scenario.data && scenario.data.length
          ? collection.insertMany(scenario.data)
          : Promise.resolve()
      )
      .then(() =>
        promiseTry(() => {
          switch (scenarioTest.operation.name) {
            case 'aggregate':
              return executeAggregateTest(scenarioTest, context.db, collection);
            case 'count':
              return executeCountTest(scenarioTest, context.db, collection);
            case 'countDocuments':
              return executeCountDocumentsTest(scenarioTest, context.db, collection);
            case 'estimatedDocumentCount':
              return executeEstimatedDocumentCountTest(scenarioTest, context.db, collection);
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
        })
      )
      .then(
        () => {
          if (
            outcome.error === true &&
            scenarioTest.operation.name !== 'bulkWrite' &&
            scenarioTest.operation.name !== 'insertMany'
          ) {
            throw new Error('Error expected!');
          }
        },
        err => {
          if (outcome && (outcome.error == null || outcome.error === false)) {
            throw err;
          }
        }
      );
  }
});
describe('CRUD unified', function () {
  runUnifiedSuite(loadSpecTests(path.join('crud', 'unified')));
});
