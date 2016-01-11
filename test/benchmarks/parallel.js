var Suite = require('betterbenchmarks').Suite,
  Benchmark = require('betterbenchmarks').Benchmark,
  JSONStream = require('JSONStream'),
  es = require('event-stream'),
  co = require('co'),
  stream = require('stream'),
  f = require('util').format,
  fs = require('fs'),
  ldj = require('ldjson-stream'),
  globalSetup = require('./shared').globalSetup,
  getDb = require('./shared').getDb,
  deflate = require('./shared').deflate,
  MongoClient = require('../../').MongoClient,
  GridFSBucket = require('../../').GridFSBucket;

// Create a suite
var suite = new Suite('feather weight test suite', {
  warmup: 1, cycles: 10, iterations: 10000, async:true
});

// -----------------------------------------------------------------------------
//
// LDJSON multi-file import
//
// -----------------------------------------------------------------------------
suite.addTest(new Benchmark('LDJSON multi-file import', {
    iterations: 1, cycles: 1
  })
  // Add custom method (we are responsible for marking the demarkation)
  .custom(function(context, stats, options, callback) {
    // Number of workers
    var workers = 10;

    // Worker farm
    var workerFarm = require('worker-farm'),
      processes = workerFarm({
        maxConcurrentWorkers: workers,
        autoStart: true
      }, require.resolve(f('%s/parallel_ldjson_import_child', __dirname)));

    // Read in all the ldjson documents
    var files = fs.readdirSync(f('%s/performance-data/LDJSON_MULTI', __dirname));

    // Process all the files
    files = files.filter(function(x) {
      return x.indexOf('.txt');
    }).map(function(x) {
      return f('%s/performance-data/LDJSON_MULTI/%s', __dirname, x);
    });

    // Number of workers
    var workersleft = workers;
    var range = 100/workers;
    var index = 0;

    // Go over all the workers
    for(var i = 0; i < workers; i++) {
      processes({
        index: index,
        files: files.slice(index, index + range)
      }), function(err, outp) {
        workersleft = workersleft - 1;

        if(workersleft == 0) {
          stats.endIteration();
          workerFarm.end(processes);
          callback();
        }
      });

      index = index + range;
    }

    // Run a single iteration
    stats.startIteration();
  })
  .addMetadata({
    custom:true
  })
  .cycle().setup(function(context, options, callback) {
    callback();
  })
  .setup(function(context, options, callback) {
    co(function*(){
      // Start up the server
      context.manager = yield globalSetup();
      // Get db connection
      context.db = yield getDb('benchmark', 50);
      // Get the corpus collection
      context.collection = context.db.collection('corpus');
      // Finish up
      callback();
    }).catch(function(e) {
      console.log(e.stack);
    });
  })
  .teardown(function(context, stats, options, callback) {
    co(function*(){
      // Stop the db connection
      yield context.db.close();
      // Start up the server
      context.manager.stop();
      // Finish up
      callback();
    }).catch(function(e) {
      console.log(e.stack);
    });
  })
);

// -----------------------------------------------------------------------------
//
// LDJSON multi-file export
//
// -----------------------------------------------------------------------------
suite.addTest(new Benchmark('LDJSON multi-file export', {
    iterations: 1, cycles: 1
  })
  // Add custom method (we are responsible for marking the demarkation)
  .custom(function(context, stats, options, callback) {
    // Number of workers
    var workers = 10;

    // Worker farm
    var workerFarm = require('worker-farm'),
      processes = workerFarm({
        maxConcurrentWorkers: workers,
        autoStart: true
      }, require.resolve(f('%s/parallel_ldjson_export_child', __dirname)));

    // Number of workers
    var workersleft = workers;
    var range = 100/workers;
    var index = 0;

    // Go over all the workers
    for(var i = 0; i < workers; i++) {
      processes({s: index, e: index + range}, function(err, outp) {
        workersleft = workersleft - 1;

        if(workersleft == 0) {
          stats.endIteration();
          workerFarm.end(processes);
          callback();
        }
      });

      index = index + range;
    }

    // Run a single iteration
    stats.startIteration();
  })
  .addMetadata({
    custom:true
  })
  .setup(function(context, options, callback) {
    co(function*(){
      // Start up the server
      context.manager = yield globalSetup();
      // Get db connection
      context.db = yield getDb('benchmark', 50);
      // Get the corpus collection
      context.collection = context.db.collection('corpus');
      // Create an index for _i field
      yield context.collection.ensureIndex({_i:1});
      // Total number of docs
      context.docs = 0;

      // Number of workers
      var workers = 10;
      // workers = 1;

      // Worker farm
      var workerFarm = require('worker-farm'),
        processes = workerFarm({
          maxConcurrentWorkers: workers,
          autoStart: true
        }, require.resolve(f('%s/parallel_ldjson_import_child', __dirname)));

      // Read in all the ldjson documents
      var files = fs.readdirSync(f('%s/performance-data/LDJSON_MULTI', __dirname));
      // files = files.slice(0, 1)
      // Process all the files
      files = files.filter(function(x) {
        return x.indexOf('.txt');
      }).map(function(x) {
        return f('%s/performance-data/LDJSON_MULTI/%s', __dirname, x);
      });

      // Number of workers
      var workersleft = workers;
      var range = 100/workers;
      var index = 0;

      // Go over all the workers
      for(var i = 0; i < workers; i++) {
        processes({
          index: index,
          files: files.slice(index, index + range)
        }, function(err, outp) {
          workersleft = workersleft - 1;
          context.docs += 5000;

          if(workersleft == 0) {
            workerFarm.end(processes);
            callback();
          }
        });

        index = index + range;
      }
    }).catch(function(e) {
      console.log(e.stack);
    });
  })
  .teardown(function(context, stats, options, callback) {
    co(function*(){
      // Stop the db connection
      yield context.db.close();
      // Start up the server
      context.manager.stop();
      // Finish up
      callback();
    }).catch(function(e) {
      console.log(e.stack);
    });
  })
);

// -----------------------------------------------------------------------------
//
// GridFS multi-file upload
//
// -----------------------------------------------------------------------------
suite.addTest(new Benchmark('GridFS multi-file upload', {
    iterations: 1, cycles: 1
  })
  // Add custom method (we are responsible for marking the demarkation)
  .custom(function(context, stats, options, callback) {
    // Number of workers
    var workers = 5;

    // Worker farm
    var workerFarm = require('worker-farm'),
      processes = workerFarm({
        maxConcurrentWorkers: workers,
        autoStart: true
      }, require.resolve(f('%s/parallel_gridfs_import_child', __dirname)));

    // Read in all the ldjson documents
    var files = fs.readdirSync(f('%s/performance-data/GRIDFS_MULTI', __dirname));

    // Process all the files
    files = files.filter(function(x) {
      return x.indexOf('.txt');
    }).map(function(x) {
      return f('%s/performance-data/GRIDFS_MULTI/%s', __dirname, x);
    });

    // Number of workers
    var workersleft = workers;
    var range = 50/workers;
    var index = 0;

    // Go over all the workers
    for(var i = 0; i < workers; i++) {
      processes({
        index: index,
        files: files.slice(index, index + range)
      }, function(err, outp) {
        workersleft = workersleft - 1;

        if(workersleft == 0) {
          stats.endIteration();
          workerFarm.end(processes);
          callback();
        }
      });

      index = index + range;
    }

    // Run a single iteration
    stats.startIteration();
  })
  .addMetadata({
    custom:true
  })
  .cycle().setup(function(context, options, callback) {
    callback();
  })
  .setup(function(context, options, callback) {
    co(function*(){
      // Start up the server
      context.manager = yield globalSetup();
      // Get db connection
      context.db = yield getDb('benchmark', 50);
      // Get the corpus collection
      context.collection = context.db.collection('corpus');
      // Finish up
      callback();
    }).catch(function(e) {
      console.log(e.stack);
    });
  })
  .teardown(function(context, stats, options, callback) {
    co(function*(){
      // Stop the db connection
      yield context.db.close();
      // Start up the server
      context.manager.stop();
      // Finish up
      callback();
    }).catch(function(e) {
      console.log(e.stack);
    });
  })
);

// -----------------------------------------------------------------------------
//
// GridFS multi-file download
//
// -----------------------------------------------------------------------------
suite.addTest(new Benchmark('GridFS multi-file download', {
    iterations: 1, cycles: 1
  })
  // Add custom method (we are responsible for marking the demarkation)
  .custom(function(context, stats, options, callback) {
    // Number of workers
    var workers = 5;

    // Worker farm
    var workerFarm = require('worker-farm'),
      processes = workerFarm({
        maxConcurrentWorkers: workers,
        autoStart: true
      }, require.resolve(f('%s/parallel_gridfs_export_child', __dirname)));

    // Number of workers
    var workersleft = workers;
    var range = 50/workers;
    var index = 0;

    // Go over all the workers
    for(var i = 0; i < workers; i++) {
      processes({s: index, e: index + range}, function(err, outp) {
        workersleft = workersleft - 1;

        if(workersleft == 0) {
          stats.endIteration();
          workerFarm.end(processes);
          callback();
        }
      });

      index = index + range;
    }

    stats.startIteration();
  })
  .addMetadata({
    custom:true
  })
  .setup(function(context, options, callback) {
    co(function*(){
      // Start up the server
      context.manager = yield globalSetup();
      // Get db connection
      context.db = yield getDb('benchmark', 50);
      // Number of workers
      var workers = 5;

      // Worker farm
      var workerFarm = require('worker-farm'),
        processes = workerFarm({
          maxConcurrentWorkers: workers,
          autoStart: true
        }, require.resolve(f('%s/parallel_gridfs_import_child', __dirname)));

      // Read in all the ldjson documents
      var files = fs.readdirSync(f('%s/performance-data/GRIDFS_MULTI', __dirname));

      // Process all the files
      files = files.filter(function(x) {
        return x.indexOf('.txt');
      }).map(function(x) {
        return f('%s/performance-data/GRIDFS_MULTI/%s', __dirname, x);
      });

      // Number of workers
      var workersleft = workers;
      var range = 50/workers;
      var index = 0;

      // Go over all the workers
      for(var i = 0; i < workers; i++) {
        processes({
          index: index,
          files: files.slice(index, index + range)
        }, function(err, outp) {
          workersleft = workersleft - 1;

          if(workersleft == 0) {
            workerFarm.end(processes);
            callback();
          }
        });

        index = index + range;
      }
    }).catch(function(e) {
      console.log(e.stack);
    });
  })
  .teardown(function(context, stats, options, callback) {
    co(function*(){
      // Stop the db connection
      yield context.db.close();
      // Start up the server
      context.manager.stop();
      // Finish up
      callback();
    }).catch(function(e) {
      console.log(e.stack);
    });
  })
);

module.exports = suite;
