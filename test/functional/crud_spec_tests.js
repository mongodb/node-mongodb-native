var fs = require('fs'),
  co = require('co'),
  semver = require('semver');

exports['Execute all read crud specification tests'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    co(function*() {
      // Create db connection
      var MongoClient = configuration.require.MongoClient;
      var db = yield MongoClient.connect(configuration.url());

      console.log("== Execute CRUD read specifications");

      // Read and parse all the tests cases
      var scenarios = fs.readdirSync(`${__dirname}/crud/read`).filter(x => {
        return x.indexOf('json') != -1;
      }).map(x => {
        return fs.readFileSync(`${__dirname}/crud/read/${x}`, 'utf8');
      }).map(x => {
        return JSON.parse(x);
      });

      for(var scenario of scenarios) {
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
      var MongoClient = configuration.require.MongoClient;
      var db = yield MongoClient.connect(configuration.url());

      console.log("== Execute CRUD read specifications");

      // Read and parse all the tests cases
      var scenarios = fs.readdirSync(`${__dirname}/crud/write`).filter(x => {
        return x.indexOf('json') != -1;
      }).map(x => {
        return fs.readFileSync(`${__dirname}/crud/write/${x}`, 'utf8');
      }).map(x => {
        return JSON.parse(x);
      });

      for(var scenario of scenarios) {
        yield executeScenario(scenario, configuration, db, test);
      }

      test.done();
    });
  }
}

function executeScenario(scenario, configuration, db, test) {
  return new Promise((resolve, reject) => {
    co(function*() {
      var buildInfo = yield db.admin().command({buildInfo:true});
      var mongodbVersion = buildInfo.version.split('-').shift();
      var requiredMongodbVersion = scenario.minServerVersion;
      var collection = db.collection('crud_spec_tests');

      // Do we satisfy semver
      if (semver.satisfies(mongodbVersion, `>=${requiredMongodbVersion}`) || !requiredMongodbVersion) {
        for (var scenarioTest of scenario.tests) {
          var description = scenarioTest.description;
          var name = scenarioTest.operation.name;

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
            var options = {};
            if (scenarioTest.operation.arguments.collation) {
              options.collation = scenarioTest.operation.arguments.collation;
            }

            var results = yield collection[name](
              scenarioTest.operation.arguments.pipeline, options
            )
            .toArray();

            if(scenarioTest.outcome.collection) {
              var collectionResults = yield db
                .collection(scenarioTest.outcome.collection.name)
                .find({})
                .toArray();
              test.deepEqual(scenarioTest.outcome.result, collectionResults);
            } else {
              test.deepEqual(scenarioTest.outcome.result, results);
            }
          } else if (name == 'count') {
            var arguments = scenarioTest.operation.arguments;
            var filter = arguments.filter;
            var options = Object.assign({}, arguments);
            delete options.filter;

            var result = yield collection.count(filter, options);
            test.equal(scenarioTest.outcome.result, result);
          } else if (name == 'distinct') {
            var arguments = scenarioTest.operation.arguments;
            var fieldName = arguments.fieldName;
            var options = Object.assign({}, arguments);
            var filter = arguments.filter || {};
            delete options.fieldName;
            delete options.filter;

            var result = yield collection.distinct(fieldName, filter, options);
            test.deepEqual(scenarioTest.outcome.result, result);
          } else if (name == 'find') {
            var arguments = scenarioTest.operation.arguments;
            var filter = arguments.filter;
            var options = Object.assign({}, arguments);
            delete options.filter;

            var results = yield collection.find(filter, options).toArray();
            test.deepEqual(scenarioTest.outcome.result, results);
          } else if (name == 'deleteMany' || name == 'deleteOne') {
            // Unpack the scenario test
            var arguments = scenarioTest.operation.arguments;
            var filter = arguments.filter;
            var options = Object.assign({}, arguments);
            delete options.filter;

            // Get the results
            var result = yield collection[scenarioTest.operation.name](filter, options);

            // Go over the results
            for (var name in scenarioTest.outcome.result) {
              test.equal(scenarioTest.outcome.result[name], result[name]);
            }

            if (scenarioTest.outcome.collection) {
              var results = yield collection.find({}).toArray();
              test.deepEqual(scenarioTest.outcome.collection.data, results);
            }
          } else if (name == 'replaceOne') {
            // Unpack the scenario test
            var arguments = scenarioTest.operation.arguments;
            var filter = arguments.filter;
            var replacement = arguments.replacement;
            var options = Object.assign({}, arguments);
            delete options.filter;
            delete options.replacement;

            // Get the results
            var result = yield collection[scenarioTest.operation.name](filter, replacement, options);

            // Go over the results
            for (var name in scenarioTest.outcome.result) {
              test.equal(scenarioTest.outcome.result[name], result[name]);
            }

            if (scenarioTest.outcome.collection) {
              var results = yield collection.find({}).toArray();
              test.deepEqual(scenarioTest.outcome.collection.data, results);
            }
          } else if (name == 'updateOne' || name == 'updateMany') {
            // Unpack the scenario test
            var arguments = scenarioTest.operation.arguments;
            var filter = arguments.filter;
            var update = arguments.update;
            var options = Object.assign({}, arguments);
            delete options.filter;
            delete options.update;

            // Get the results
            var result = yield collection[scenarioTest.operation.name](filter, update, options);

            // Go over the results
            for (var name in scenarioTest.outcome.result) {
              test.equal(scenarioTest.outcome.result[name], result[name]);
            }

            if (scenarioTest.outcome.collection) {
              var results = yield collection.find({}).toArray();
              test.deepEqual(scenarioTest.outcome.collection.data, results);
            }
          } else if (name == 'findOneAndReplace'
            || name == 'findOneAndUpdate' || name == 'findOneAndDelete') {
            // Unpack the scenario test
            var arguments = scenarioTest.operation.arguments;
            var filter = arguments.filter;
            var second = arguments.update || arguments.replacement;
            var options = Object.assign({}, arguments);
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
              var results = yield collection.find({}).toArray();
              test.deepEqual(scenarioTest.outcome.collection.data, results);
            }
          }
        }
      }

      resolve();
    }).catch(err => {
      console.log(err.stack)
      reject(err);
    });
  });
}
