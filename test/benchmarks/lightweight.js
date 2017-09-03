var Suite = require('betterbenchmarks').Suite,
  Benchmark = require('betterbenchmarks').Benchmark,
  // JSONStream = require('JSONStream'),
  // es = require('event-stream'),
  co = require('co'),
  stream = require('stream'),
  f = require('util').format,
  fs = require('fs'),
  // ldj = require('ldjson-stream'),
  globalSetup = require('./shared').globalSetup,
  getDb = require('./shared').getDb,
  deflate = require('./shared').deflate,
  // MongoClient = require('../../').MongoClient,
  GridFSBucket = require('../../').GridFSBucket;

// Created a BSON instance
var BSON = require('bson').native().BSON;

// Create a suite
var suite = new Suite('feather weight test suite', {
  warmup: 1,
  cycles: 10,
  iterations: 10000,
  async: true
});

// -----------------------------------------------------------------------------
//
// RUN COMMAND BENCHMARK
//
// -----------------------------------------------------------------------------

// ismaster run in serial mode
suite.addTest(
  new Benchmark('ismaster command benchmark in serial mode')
    .set(function(context, callback) {
      context.db.command({ ismaster: true }, function() {
        callback();
      });
    })
    .setup(function(context, options, callback) {
      co(function*() {
        // Create a bson serializer
        var bson = new BSON();
        // Start up the server
        context.manager = yield globalSetup();
        // Total size
        context.size = bson.calculateObjectSize({ ismaster: true }) * suite.options.iterations;
        // Get db connection
        context.db = yield getDb('benchmark', 10);
        // Finish up
        callback();
      }).catch(function(e) {
        console.log(e.stack);
      });
    })
    .teardown(function(context, stats, options, callback) {
      co(function*() {
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

// // Add the flat json parsing test
// suite.addTest(new Benchmark('ismaster command benchmark parallel')
//   // Add custom method (we are responsible for marking the demarkation)
//   .custom(function(context, stats, callback) {
//     // Commands left to do
//     var left = suite.options.iterations;
//
//     // Keep scope local for stat object
//     var execute = function() {
//       var stat = stats.startParallelIteration();
//       // Execute the command
//       context.db.command({ismaster:true}, function(err, r) {
//         stat.end();
//         left = left - 1;
//
//         if(left == 0) {
//           callback();
//         }
//       });
//     }
//
//     // Fire of all the messages in parallel
//     for(var i = 0; i < suite.options.iterations; i++) {
//       execute()
//     }
//   })
//   .addMetadata({custom:true})
//   .setup(function(context, options, callback) {
//     co(function*(){
//       // Create a bson serializer
//       var bson = new BSON();
//       // Start up the server
//       context.manager = yield globalSetup();
//       // Total size
//       context.size = bson.calculateObjectSize({ismaster:true}) * suite.options.iterations;
//       // Get db connection
//       context.db = yield getDb('benchmark', 10);
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
//   .teardown(function(context, stats, options, callback) {
//     co(function*(){
//       // Stop the db connection
//       yield context.db.close();
//       // Start up the server
//       context.manager.stop();
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
// );

// -----------------------------------------------------------------------------
//
// FIND ONE BY ID
//
// -----------------------------------------------------------------------------

// Add the flat json parsing test
suite.addTest(
  new Benchmark('find one by id')
    // The benchmark function
    .set(function(context, callback) {
      context.collection.findOne({ _id: context.queryId++ }, function() {
        callback();
      });
    })
    .setup(function(context, options, callback) {
      co(function*() {
        // Start up the server
        context.manager = yield globalSetup();
        // Get db connection
        context.db = yield getDb('benchmark', 10);
        // Get the corpus collection
        context.collection = context.db.collection('corpus');
        // Get the json document
        var json = fs.readFileSync(
          f('%s/performance-data/SINGLE_DOCUMENT/TWEET.json', __dirname),
          'utf8'
        );
        json = JSON.parse(json);
        json = deflate(json);
        // Add to the context
        context.json = json;
        // Id used for the docs
        context.id = 1;
        // Context query id
        context.queryId = 1;

        // Insert 10k records
        for (var i = 0; i < 10000; i++) {
          context.json._id = context.id++;
          yield context.collection.insertOne(context.json);
        }

        // Finish up the setup
        callback();
      }).catch(function(e) {
        console.log(e.stack);
      });
    })
    .teardown(function(context, stats, options, callback) {
      co(function*() {
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

// // Add the flat json parsing test
// suite.addTest(new Benchmark('find one by id MB/s parallel')
//   // Add custom method (we are responsible for marking the demarkation)
//   .custom(function(context, stats, callback) {
//     // Commands left to do
//     var left = suite.options.iterations;
//
//     // Run a single iteration
//     stats.startIteration();
//
//     // Fire of all the messages in parallel
//     for(var i = 0; i < suite.options.iterations; i++) {
//       context.collection.findOne({_id: i}, function() {
//         left = left - 1;
//
//         if(left == 0) {
//           stats.endIteration();
//           callback();
//         }
//       });
//     }
//   })
//   .setup(function(context, options, callback) {
//     co(function*(){
//       // Create a bson serializer
//       var bson = new BSON();
//       // Start up the server
//       context.manager = yield globalSetup();
//       // Get db connection
//       context.db = yield getDb('benchmark', 10);
//       // Get the corpus collection
//       context.collection = context.db.collection('corpus');
//       // Id used for the docs
//       context.id = 1;
//       // Context query id
//       context.queryId = 1;
//       // Size used to calculate the
//       context.size = 0;
//       // Insert all the documents
//       var filestream = fs.createReadStream(f('%s/performance-data/TWITTER', __dirname));
//       filestream
//       .pipe(ldj.parse())
//       .on('data', function(doc) {
//         filestream.pause();
//         // Add _id value
//         doc._id = context.id++;
//
//         // Calculate the bson size for the first 100000 docs
//         if(context.id <= 10000) {
//           context.size = context.size + bson.calculateObjectSize(doc);
//         }
//
//         // Perform an insert
//         context.collection.insertOne(doc, {w:1}, function(err, r) {
//           filestream.resume();
//         });
//       })
//       .on('end', function() {
//         callback();
//       });
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
//   .teardown(function(context, stats, options, callback) {
//     co(function*(){
//       // Stop the db connection
//       yield context.db.close();
//       // Start up the server
//       context.manager.stop();
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
// );

// -----------------------------------------------------------------------------
//
// SMALL DOC INSERT
//
// -----------------------------------------------------------------------------

// Add the flat json parsing test
suite.addTest(
  new Benchmark('small doc insert MB/s 1')
    // Add custom method (we are responsible for marking the demarkation)
    .set(function(context, callback) {
      context.collection.insertOne(
        context.json,
        {
          forceServerObjectId: true
        },
        function() {
          callback();
        }
      );
    })
    .cycle()
    .setup(function(context, options, callback) {
      context.db.createCollection('corpus', function() {
        callback();
      });
    })
    .cycle()
    .teardown(function(context, options, callback) {
      context.collection.drop(function() {
        callback();
      });
    })
    .setup(function(context, options, callback) {
      co(function*() {
        // Start up the server
        context.manager = yield globalSetup();
        // Get db connection
        context.db = yield getDb('benchmark', 10);
        // Get the corpus collection
        context.collection = context.db.collection('corpus');
        // Get the json document
        var json = fs.readFileSync(
          f('%s/performance-data/SINGLE_DOCUMENT/SMALL_DOC.json', __dirname),
          'utf8'
        );
        json = JSON.parse(json);
        json = deflate(json);
        // Add to the context
        context.json = json;
        // Finish up the setup
        callback();
      }).catch(function(e) {
        console.log(e.stack);
      });
    })
    .teardown(function(context, stats, options, callback) {
      co(function*() {
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

// // Add the flat json parsing test
// suite.addTest(new Benchmark('small doc insert MB/s parallel')
//   // Add custom method (we are responsible for marking the demarkation)
//   .custom(function(context, stats, callback) {
//     var left = suite.options.iterations;
//
//     // Keep scope local for stat object
//     var execute = function() {
//       delete context.json['_id'];
//       var stat = stats.startParallelIteration();
//       // Execute the command
//       context.collection.insertOne(context.json, function(err, r) {
//         console.dir(r)
//         stat.end();
//         left = left - 1;
//
//         if(left == 0) {
//           callback();
//         }
//       });
//     }
//
//     // Fire of all the messages in parallel
//     for(var i = 0; i < suite.options.iterations; i++) {
//       execute(context.json);
//     }
//   })
//   .cycle().setup(function(context, options, callback) {
//     context.collection.drop(function() {
//       callback();
//     });
//   })
//   .setup(function(context, options, callback) {
//     co(function*(){
//       // Start up the server
//       context.manager = yield globalSetup();
//       // Get db connection
//       context.db = yield getDb('benchmark', 10);
//       // Get the corpus collection
//       context.collection = context.db.collection('corpus');
//       // Get the json document
//       var json = fs.readFileSync(f('%s/performance-data/SINGLE_DOCUMENT/SMALL_DOC.json', __dirname), 'utf8');
//       json = JSON.parse(json);
//       json = deflate(json);
//       // Add to the context
//       context.json = json;
//       // Finish up the setup
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
//   .teardown(function(context, stats, options, callback) {
//     co(function*(){
//       // Stop the db connection
//       yield context.db.close();
//       // Start up the server
//       context.manager.stop();
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
// );

// -----------------------------------------------------------------------------
//
// LARGE DOC INSERT
//
// -----------------------------------------------------------------------------

// Add the flat json parsing test
suite.addTest(
  new Benchmark('large doc insert', {
    cycles: 5,
    iterations: 10
  })
    // Add custom method (we are responsible for marking the demarkation)
    .set(function(context, callback) {
      context.collection.insertOne(
        context.json,
        {
          forceServerObjectId: true
        },
        function() {
          callback();
        }
      );
    })
    .cycle()
    .setup(function(context, options, callback) {
      context.db.createCollection('corpus', function() {
        callback();
      });
    })
    .cycle()
    .teardown(function(context, options, callback) {
      context.collection.drop(function() {
        callback();
      });
    })
    .setup(function(context, options, callback) {
      co(function*() {
        // Start up the server
        context.manager = yield globalSetup();
        // Get db connection
        context.db = yield getDb('benchmark', 10);
        // Get the corpus collection
        context.collection = context.db.collection('corpus');
        // Get the json document
        var json = fs.readFileSync(
          f('%s/performance-data/SINGLE_DOCUMENT/LARGE_DOC.json', __dirname),
          'utf8'
        );
        json = JSON.parse(json);
        json = deflate(json);
        // Add to the context
        context.json = json;
        // Finish up the setup
        callback();
      }).catch(function(e) {
        console.log(e.stack);
      });
    })
    .teardown(function(context, stats, options, callback) {
      co(function*() {
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

// // Add the flat json parsing test
// suite.addTest(new Benchmark('large doc insert parallell', {
//     iterations:10
//   })
//   // Add custom method (we are responsible for marking the demarkation)
//   .custom(function(context, stats, options, callback) {
//     var left = options.iterations;
//
//     // Keep scope local for stat object
//     var execute = function() {
//       delete context.json['_id'];
//       var stat = stats.startParallelIteration();
//       // Execute the command
//       context.collection.insertOne(context.json, function(err, r) {
//         stat.end();
//         left = left - 1;
//
//         if(left == 0) {
//           callback();
//         }
//       });
//     }
//
//     // Fire of all the messages in parallel
//     for(var i = 0; i < options.iterations; i++) {
//       execute(context.json);
//     }
//   })
//   .cycle().setup(function(context, options, callback) {
//     context.collection.drop(function() {
//       callback();
//     });
//   })
//   .setup(function(context, options, callback) {
//     co(function*(){
//       // Start up the server
//       context.manager = yield globalSetup();
//       // Get db connection
//       context.db = yield getDb('benchmark', 10);
//       // Get the corpus collection
//       context.collection = context.db.collection('corpus');
//       // Get the json document
//       var json = fs.readFileSync(f('%s/performance-data/SINGLE_DOCUMENT/LARGE_DOC.json', __dirname), 'utf8');
//       json = JSON.parse(json);
//       json = deflate(json);
//       // Add to the context
//       context.json = json;
//       // Finish up the setup
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
//   .teardown(function(context, stats, options, callback) {
//     co(function*(){
//       // Stop the db connection
//       yield context.db.close();
//       // Start up the server
//       context.manager.stop();
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
// );

// -----------------------------------------------------------------------------
//
// Find many and empty the cursor
//
// -----------------------------------------------------------------------------

// Add the flat json parsing test
suite.addTest(
  new Benchmark('find one by id', {
    iterations: 1
  })
    // The benchmark function
    .set(function(context, callback) {
      context.collection.find({}).each(function(e, r) {
        if (r == null) callback();
      });
    })
    .setup(function(context, options, callback) {
      co(function*() {
        // Start up the server
        context.manager = yield globalSetup();
        // Get db connection
        context.db = yield getDb('benchmark', 10);
        // Get the corpus collection
        context.collection = context.db.collection('corpus');
        // Get the json document
        var json = fs.readFileSync(
          f('%s/performance-data/SINGLE_DOCUMENT/TWEET.json', __dirname),
          'utf8'
        );
        json = JSON.parse(json);
        json = deflate(json);
        // Add to the context
        context.json = json;
        // Id used for the docs
        context.id = 1;
        // Context query id
        context.queryId = 1;

        // Insert 10k records
        for (var i = 0; i < 10000; i++) {
          context.json._id = context.id++;
          yield context.collection.insertOne(context.json);
        }

        // Finish up the setup
        callback();
      }).catch(function(e) {
        console.log(e.stack);
      });
    })
    .teardown(function(context, stats, options, callback) {
      co(function*() {
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
// Small doc bulk insert
//
// -----------------------------------------------------------------------------

suite.addTest(
  new Benchmark('small doc bulk insert')
    // Add custom method (we are responsible for marking the demarkation)
    .custom(function(context, stats, options, callback) {
      // Run a single iteration
      stats.startIteration();
      // Execute bulk insert
      context.collection.insertMany(
        context.documents,
        {
          ordered: false,
          forceServerObjectId: true
        },
        function() {
          stats.endIteration();
          callback();
        }
      );
    })
    .addMetadata({
      custom: true
    })
    .cycle()
    .setup(function(context, options, callback) {
      context.db.createCollection('corpus', function() {
        callback();
      });
    })
    .cycle()
    .teardown(function(context, options, callback) {
      context.collection.drop(function() {
        callback();
      });
    })
    .setup(function(context, options, callback) {
      co(function*() {
        // Start up the server
        context.manager = yield globalSetup();
        // Get db connection
        context.db = yield getDb('benchmark', 10);
        // Get the corpus collection
        context.collection = context.db.collection('corpus');
        // Size used to calculate the
        context.size = 0;
        // Documents
        context.documents = [];
        // Read the docment
        var json = fs.readFileSync(
          f('%s/performance-data/SINGLE_DOCUMENT/SMALL_DOC.json', __dirname),
          'utf8'
        );
        json = JSON.parse(json);
        json = deflate(json);
        // Add to the context
        context.json = json;
        // Create 10k documents to insert
        for (var i = 0; i < 10000; i++) {
          context.documents.push(Object.assign({}, json));
        }

        // Wrap up the call
        callback();
      }).catch(function(e) {
        console.log(e.stack);
      });
    })
    .teardown(function(context, stats, options, callback) {
      co(function*() {
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
// Large doc bulk insert
//
// -----------------------------------------------------------------------------

suite.addTest(
  new Benchmark('large doc bulk insert')
    // Add custom method (we are responsible for marking the demarkation)
    .custom(function(context, stats, options, callback) {
      // Run a single iteration
      stats.startIteration();
      // Execute bulk insert
      context.collection.insertMany(
        context.documents,
        {
          ordered: false,
          forceServerObjectId: true
        },
        function() {
          stats.endIteration();
          callback();
        }
      );
    })
    .addMetadata({
      custom: true
    })
    .cycle()
    .setup(function(context, options, callback) {
      context.db.createCollection('corpus', function() {
        callback();
      });
    })
    .cycle()
    .teardown(function(context, options, callback) {
      context.collection.drop(function() {
        callback();
      });
    })
    .setup(function(context, options, callback) {
      co(function*() {
        // Start up the server
        context.manager = yield globalSetup();
        // Get db connection
        context.db = yield getDb('benchmark', 10);
        // Get the corpus collection
        context.collection = context.db.collection('corpus');
        // Size used to calculate the
        context.size = 0;
        // Documents
        context.documents = [];
        // Read the docment
        var json = fs.readFileSync(
          f('%s/performance-data/SINGLE_DOCUMENT/LARGE_DOC.json', __dirname),
          'utf8'
        );
        json = JSON.parse(json);
        json = deflate(json);
        // Add to the context
        context.json = json;
        // Create 10k documents to insert
        for (var i = 0; i < 10; i++) {
          context.documents.push(Object.assign({}, json));
        }

        // Wrap up the call
        callback();
      }).catch(function(e) {
        console.log(e.stack);
      });
    })
    .teardown(function(context, stats, options, callback) {
      co(function*() {
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
// GridFS upload
//
// -----------------------------------------------------------------------------

// Add the flat json parsing test
suite.addTest(
  new Benchmark('GridFS upload', {
    iterations: 10
  })
    .custom(function(context, stats, options, callback) {
      // Create a simple read stream
      var readStream = new stream.Readable();
      readStream._read = function noop() {}; // redundant? see update below
      readStream.push(context.file);
      readStream.push(null);

      // Upload a single file of 1 byte, priming the store and creating the indexes
      var bucket = new GridFSBucket(context.db);
      var uploadStream = bucket.openUploadStream(f('file%s.txt', context.index++));
      uploadStream.once('finish', function() {
        stats.endIteration();
        callback();
      });

      // Run a single iteration
      stats.startIteration();
      // Write the file to gridfs
      readStream.pipe(uploadStream);
    })
    .addMetadata({
      custom: true
    })
    .cycle()
    .setup(function(context, options, callback) {
      co(function*() {
        // Drop existing collections
        try {
          yield context.db.collection('files').drop();
        } catch (e) {}  // eslint-disable-line
        try {
          yield context.db.collection('chunks').drop();
        } catch (e) {}  // eslint-disable-line

        // Create a simple read stream
        var readStream = new stream.Readable();
        readStream._read = function noop() {}; // redundant? see update below
        readStream.push(new Buffer(1));
        readStream.push(null);

        // Upload a single file of 1 byte, priming the store and creating the indexes
        var bucket = new GridFSBucket(context.db);
        var uploadStream = bucket.openUploadStream(f('file%s.txt', 0));
        uploadStream.once('finish', function() {
          callback();
        });

        readStream.pipe(uploadStream);
      });
    })
    .setup(function(context, options, callback) {
      co(function*() {
        // Start up the server
        context.manager = yield globalSetup();
        // Index
        context.index = 1;
        // Get db connection
        context.db = yield getDb('benchmark', 10);
        // Load the gridfs file
        context.file = fs.readFileSync(
          f('%s/performance-data/SINGLE_DOCUMENT/GRIDFS_LARGE', __dirname),
          'binary'
        );
        // Finsish up setup
        callback();
      }).catch(function(e) {
        console.log(e.stack);
      });
    })
    .teardown(function(context, stats, options, callback) {
      co(function*() {
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
// GridFS download
//
// -----------------------------------------------------------------------------

// Add the flat json parsing test
suite.addTest(
  new Benchmark('GridFS download', {
    iterations: 10
  })
    // Add custom method (we are responsible for marking the demarkation)
    .custom(function(context, stats, options, callback) {
      var bucket = new GridFSBucket(context.db);

      // Create a simple read stream
      var downloadStream = bucket.openDownloadStream(context.id);
      // Wait for end of stream event
      downloadStream.once('end', function() {
        stats.endIteration();
        callback();
      });

      // Add data listener
      downloadStream.on('data', function() {});
      // Start timing of operation
      stats.startIteration();
    })
    .addMetadata({
      custom: true
    })
    .setup(function(context, options, callback) {
      co(function*() {
        // Start up the server
        context.manager = yield globalSetup();
        // Index
        context.index = 1;
        // Get db connection
        context.db = yield getDb('benchmark', 10);
        // Load the gridfs file
        var fileStream = fs.createReadStream(
          f('%s/performance-data/SINGLE_DOCUMENT/GRIDFS_LARGE', __dirname),
          'binary'
        );
        // Open the bucket
        var bucket = new GridFSBucket(context.db);
        // Create an upload stream
        var uploadStream = bucket.openUploadStream(f('gridfstest'));
        // Store the file id
        context.id = uploadStream.id;
        // Wait for stream to finish
        uploadStream.once('finish', function() {
          // Finsish up setup
          callback();
        });

        fileStream.pipe(uploadStream);
      }).catch(function(e) {
        console.log(e.stack);
      });
    })
    .teardown(function(context, stats, options, callback) {
      co(function*() {
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
