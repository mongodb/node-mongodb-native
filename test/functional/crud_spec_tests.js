var fs = require('fs'),
  co = require('co'),
  semver = require('semver');

exports['Execute all read crud specification tests'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    co(function*() {
      // Create db connection
      const MongoClient = configuration.require.MongoClient;
      const db = yield MongoClient.connect(configuration.url());

      console.log("== Execute CRUD read specifications");

      // Read and parse all the tests cases
      const scenarios = fs.readdirSync(`${__dirname}/crud/read`).filter(x => {
        return x.indexOf('json') != -1;
      }).map(x => {
        return fs.readFileSync(`${__dirname}/crud/read/${x}`, 'utf8');
      }).map(x => {
        return JSON.parse(x);
      });

      for(const scenario of scenarios) {
        yield executeScenario(scenario, configuration, db, test);
      }

      test.done();
    });
  }
}

exports['Execute all write crud specification tests'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    co(function*() {
      // Create db connection
      const MongoClient = configuration.require.MongoClient;
      const db = yield MongoClient.connect(configuration.url());

      console.log("== Execute CRUD read specifications");

      // Read and parse all the tests cases
      const scenarios = fs.readdirSync(`${__dirname}/crud/write`).filter(x => {
        return x.indexOf('json') != -1;
      }).map(x => {
        return fs.readFileSync(`${__dirname}/crud/write/${x}`, 'utf8');
      }).map(x => {
        return JSON.parse(x);
      });

      for(const scenario of scenarios) {
        yield executeScenario(scenario, configuration, db, test);
      }

      test.done();
    });
  }
}

function executeScenario(scenario, configuration, db, test) {
  return new Promise((resolve, reject) => {
    co(function*() {
      const buildInfo = yield db.admin().command({buildInfo:true});
      const mongodbVersion = buildInfo.version.split('-').shift();
      const requiredMongodbVersion = scenario.minServerVersion;
      const collection = db.collection('crud_spec_tests');

      // Do we satisfy semver
      if (semver.satisfies(mongodbVersion, `>=${requiredMongodbVersion}`) || !requiredMongodbVersion) {
        for (const scenarioTest of scenario.tests) {
          const description = scenarioTest.description;
          const name = scenarioTest.operation.name;

          console.log(`   execute test [${description}]`);

          // Drop collection
          try { yield collection.drop(); } catch(err) {};

          if (scenarioTest.outcome.collection && scenarioTest.outcome.collection.name) {
            try {
              yield db.collection(scenarioTest.outcome.collection.name).drop();
            } catch(err) {};
          }

          // Insert data
          if (scenario.data) {
            yield collection.insertMany(scenario.data);
          }

          if (name === 'aggregate') {
            const options = {};
            if (scenarioTest.operation.arguments.collation) {
              options.collation = scenarioTest.operation.arguments.collation;
            }

            const results = yield collection[name](
              scenarioTest.operation.arguments.pipeline, options
            )
            .toArray();

            if(scenarioTest.outcome.collection) {
              const collectionResults = yield db
                .collection(scenarioTest.outcome.collection.name)
                .find({})
                .toArray();
              test.deepEqual(scenarioTest.outcome.result, collectionResults);
            } else {
              test.deepEqual(scenarioTest.outcome.result, results);
            }
          } else if (name == 'count') {
            const arguments = scenarioTest.operation.arguments;
            const filter = arguments.filter;
            const options = Object.assign({}, arguments);
            delete options.filter;

            const result = yield collection.count(filter, options);
            test.equal(scenarioTest.outcome.result, result);
          } else if (name == 'distinct') {
            const arguments = scenarioTest.operation.arguments;
            const fieldName = arguments.fieldName;
            const options = Object.assign({}, arguments);
            const filter = arguments.filter || {};
            delete options.fieldName;
            delete options.filter;

            const result = yield collection.distinct(fieldName, filter, options);
            test.deepEqual(scenarioTest.outcome.result, result);
          } else if (name == 'find') {
            const arguments = scenarioTest.operation.arguments;
            const filter = arguments.filter;
            const options = Object.assign({}, arguments);
            delete options.filter;

            const results = yield collection.find(filter, options).toArray();
            test.deepEqual(scenarioTest.outcome.result, results);
          } else if (name == 'deleteMany' || name == 'deleteOne') {
            // Unpack the scenario test
            const arguments = scenarioTest.operation.arguments;
            const filter = arguments.filter;
            const options = Object.assign({}, arguments);
            delete options.filter;

            // Get the results
            const result = yield collection[scenarioTest.operation.name](filter, options);

            // Go over the results
            for (const name in scenarioTest.outcome.result) {
              test.equal(scenarioTest.outcome.result[name], result[name]);
            }

            if (scenarioTest.outcome.collection) {
              const results = yield collection.find({}).toArray();
              test.deepEqual(scenarioTest.outcome.collection.data, results);
            }
          } else if (name == 'replaceOne') {
            // Unpack the scenario test
            const arguments = scenarioTest.operation.arguments;
            const filter = arguments.filter;
            const replacement = arguments.replacement;
            const options = Object.assign({}, arguments);
            delete options.filter;
            delete options.replacement;

            // Get the results
            const result = yield collection[scenarioTest.operation.name](filter, replacement, options);

            // Go over the results
            for (const name in scenarioTest.outcome.result) {
              test.equal(scenarioTest.outcome.result[name], result[name]);
            }

            if (scenarioTest.outcome.collection) {
              const results = yield collection.find({}).toArray();
              test.deepEqual(scenarioTest.outcome.collection.data, results);
            }
          } else if (name == 'updateOne' || name == 'updateMany') {
            // Unpack the scenario test
            const arguments = scenarioTest.operation.arguments;
            const filter = arguments.filter;
            const update = arguments.update;
            const options = Object.assign({}, arguments);
            delete options.filter;
            delete options.update;

            // Get the results
            const result = yield collection[scenarioTest.operation.name](filter, update, options);

            // Go over the results
            for (const name in scenarioTest.outcome.result) {
              test.equal(scenarioTest.outcome.result[name], result[name]);
            }

            if (scenarioTest.outcome.collection) {
              const results = yield collection.find({}).toArray();
              test.deepEqual(scenarioTest.outcome.collection.data, results);
            }
          } else if (name == 'findOneAndReplace'
            || name == 'findOneAndUpdate' || name == 'findOneAndDelete') {
            // Unpack the scenario test
            const arguments = scenarioTest.operation.arguments;
            const filter = arguments.filter;
            const second = arguments.update || arguments.replacement;
            const options = Object.assign({}, arguments);
            if (options.returnDocument) {
              options.returnOriginal = options.returnDocument == 'After' ? false : true;
            }

            delete options.filter;
            delete options.update;
            delete options.replacement;
            delete options.returnDocument;

            if (name == 'findOneAndDelete') {
              var result = yield collection[name](filter, options);
            } else {
              var result = yield collection[name](filter, second, options);
            }

            if(scenarioTest.outcome.result) {
              test.deepEqual(scenarioTest.outcome.result, result.value);
            }

            if (scenarioTest.outcome.collection) {
              const results = yield collection.find({}).toArray();
              test.deepEqual(scenarioTest.outcome.collection.data, results);
            }
          }
        }
      }

      resolve();
    }).catch(err => {
      console.log(err)
      reject(err);
    });
  });
}
