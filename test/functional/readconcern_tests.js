"use strict";

var f = require('util').format;

var restartAndDone = function(configuration, test) {
  configuration.manager.restart(function() {
    test.done();
  });
}

exports.beforeTests = function(configuration, callback) {
  configuration.restart({purge:false, kill:true}, function() {
    callback();
  });
}

exports['Should set local readConcern on db level'] = {
  metadata: { requires: { topology: 'replicaset', mongodb: ">= 2.4.X" } },

  test: function(configuration, test) {
    var listener = require('../..').instrument(function(err, instrumentations) {});
    // Contains all the apm events
    var started = [];
    // Get a new instance
    var db = configuration.newDbInstance({w:1, readConcern: {level: 'local'}}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);
      test.deepEqual({level: 'local'}, db.s.readConcern);

      // Get a collection
      var collection = db.collection('readConcernCollection');
      // Validate readConcern
      test.deepEqual({level: 'local'}, collection.s.readConcern);
      // Perform a find using the readConcern
      listener.on('started', function(event) {
        if(event.commandName == 'find')
          started.push(event);
      });

      // Execute find
      collection.find().toArray(function(err, r) {
        test.equal(1, started.length);
        test.deepEqual({level:'local'}, started[0].command.readConcern);

        listener.uninstrument();
        db.close();
        test.done();
      });
    });
  }
}

exports['Should set majority readConcern on db level'] = {
  metadata: { requires: { topology: 'replicaset', mongodb: ">= 3.1.7" } },

  test: function(configuration, test) {
    var listener = require('../..').instrument(function(err, instrumentations) {});
    // Contains all the apm events
    var started = [];
    // Get a new instance
    var db = configuration.newDbInstance({w:1, readConcern: {level: 'majority'}}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);
      test.deepEqual({level: 'majority'}, db.s.readConcern);

      // Get a collection
      var collection = db.collection('readConcernCollection');
      // Validate readConcern
      test.deepEqual({level: 'majority'}, collection.s.readConcern);
      // Perform a find using the readConcern
      listener.on('started', function(event) {
        if(event.commandName == 'find')
          started.push(event);
      });

      // Execute find
      collection.find().toArray(function(err, r) {
        test.equal(1, started.length);
        test.deepEqual({level:'majority'}, started[0].command.readConcern);

        listener.uninstrument();
        db.close();
        test.done();
      });
    });
  }
}

exports['Should set local readConcern at collection level'] = {
  metadata: { requires: { topology: 'replicaset', mongodb: ">= 2.4.X" } },

  test: function(configuration, test) {
    var listener = require('../..').instrument(function(err, instrumentations) {});
    // Contains all the apm events
    var started = [];
    // Get a new instance
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);
      // Get a collection
      var collection = db.collection('readConcernCollection', {readConcern: {level: 'local'}});
      // Validate readConcern
      test.deepEqual({level: 'local'}, collection.s.readConcern);
      // Perform a find using the readConcern
      listener.on('started', function(event) {
        if(event.commandName == 'find')
          started.push(event);
      });

      // Execute find
      collection.find().toArray(function(err, r) {
        test.equal(1, started.length);
        test.deepEqual({level:'local'}, started[0].command.readConcern);

        listener.uninstrument();
        db.close();
        test.done();
      });
    });
  }
}

exports['Should set majority readConcern at collection level'] = {
  metadata: { requires: { topology: 'replicaset', mongodb: ">= 3.1.7" } },

  test: function(configuration, test) {
    var listener = require('../..').instrument(function(err, instrumentations) {});
    // Contains all the apm events
    var started = [];
    // Get a new instance
    var db = configuration.newDbInstance({w:1, readConcern: {level: 'majority'}}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);
      // Get a collection
      var collection = db.collection('readConcernCollection', {readConcern: {level: 'majority'}});
      // Validate readConcern
      test.deepEqual({level: 'majority'}, collection.s.readConcern);
      // Perform a find using the readConcern
      listener.on('started', function(event) {
        if(event.commandName == 'find')
          started.push(event);
      });

      // Execute find
      collection.find().toArray(function(err, r) {
        test.equal(1, started.length);
        test.deepEqual({level:'majority'}, started[0].command.readConcern);

        listener.uninstrument();
        db.close();
        test.done();
      });
    });
  }
}

exports['Should set local readConcern using MongoClient'] = {
  metadata: { requires: { topology: 'replicaset', mongodb: ">= 2.4.X" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var listener = require('../..').instrument(function(err, instrumentations) {});
    // Contains all the apm events
    var started = [];
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'readConcernLevel=local')
      : f('%s?%s', url, 'readConcernLevel=local');

    // Connect using mongoclient
    MongoClient.connect(url, function(err, db) {
      test.equal(null, err);
      test.deepEqual({level: 'local'}, db.s.readConcern);

      // Get a collection
      var collection = db.collection('readConcernCollection');
      // Validate readConcern
      test.deepEqual({level: 'local'}, collection.s.readConcern);
      // Perform a find using the readConcern
      listener.on('started', function(event) {
        if(event.commandName == 'find')
          started.push(event);
      });

      // Execute find
      collection.find().toArray(function(err, r) {
        test.equal(1, started.length);
        test.deepEqual({level:'local'}, started[0].command.readConcern);

        listener.uninstrument();
        db.close();
        test.done();
      });
    });
  }
}

exports['Should set majority readConcern using MongoClient'] = {
  metadata: { requires: { topology: 'replicaset', mongodb: ">= 3.1.7" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var listener = require('../..').instrument(function(err, instrumentations) {});
    // Contains all the apm events
    var started = [];
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'readConcernLevel=majority')
      : f('%s?%s', url, 'readConcernLevel=majority');

    // Connect using mongoclient
    MongoClient.connect(url, function(err, db) {
      test.equal(null, err);
      test.deepEqual({level: 'majority'}, db.s.readConcern);

      // Get a collection
      var collection = db.collection('readConcernCollection');
      // Validate readConcern
      test.deepEqual({level: 'majority'}, collection.s.readConcern);
      // Perform a find using the readConcern
      listener.on('started', function(event) {
        if(event.commandName == 'find')
          started.push(event);
      });

      // Execute find
      collection.find().toArray(function(err, r) {
        test.equal(1, started.length);
        test.deepEqual({level:'majority'}, started[0].command.readConcern);

        listener.uninstrument();
        db.close();
        test.done();
      });
    });
  }
}

exports['Should error out with readConcern level set to majority'] = {
  metadata: { requires: { topology: 'replicaset', mongodb: "<= 3.0.X" } },

  test: function(configuration, test) {
    var listener = require('../..').instrument(function(err, instrumentations) {});
    // Contains all the apm events
    var started = [];
    // Get a new instance
    var db = configuration.newDbInstance({w:1, readConcern: {level: 'majority'}}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);
      test.deepEqual({level: 'majority'}, db.s.readConcern);

      // Get a collection
      var collection = db.collection('readConcernCollection');
      // Validate readConcern
      test.deepEqual({level: 'majority'}, collection.s.readConcern);
      // Perform a find using the readConcern
      listener.on('started', function(event) {
        if(event.commandName == 'find')
          started.push(event);
      });

      // Execute find
      collection.find().toArray(function(err, r) {
        test.ok(err != null);

        listener.uninstrument();
        db.close();
        test.done();
      });
    });
  }
}

exports['Should set majority readConcern aggregate command'] = {
  metadata: { requires: { topology: 'replicaset', mongodb: ">= 3.1.8" } },

  test: function(configuration, test) {
    var listener = require('../..').instrument(function(err, instrumentations) {});
    // Contains all the apm events
    var started = [];
    var succeeded = [];
    // Get a new instance
    var db = configuration.newDbInstance({w:1, readConcern: {level: 'majority'}}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);
      test.deepEqual({level: 'majority'}, db.s.readConcern);

      // Get a collection
      var collection = db.collection('readConcernCollectionAggregate');
      // Validate readConcern
      test.deepEqual({level: 'majority'}, collection.s.readConcern);

      // Listen to apm events
      listener.on('started', function(event) { if(event.commandName == 'aggregate') started.push(event); });
      listener.on('succeeded', function(event) { if(event.commandName == 'aggregate') succeeded.push(event);});

      // Execute find
      collection.aggregate([{$match: {}}]).toArray(function(err, r) {
        test.equal(null, err);
        test.equal(1, started.length);
        test.equal('aggregate', started[0].commandName);
        test.equal('aggregate', succeeded[0].commandName);
        test.deepEqual({level:'majority'}, started[0].command.readConcern);

        listener.uninstrument();
        db.close();
        test.done();
      });
    });
  }
}

exports['Should set majority readConcern aggregate command but ignore due to out'] = {
  metadata: { requires: { topology: 'replicaset', mongodb: ">= 3.1.8" } },

  test: function(configuration, test) {
    var listener = require('../..').instrument(function(err, instrumentations) {});
    // Contains all the apm events
    var started = [];
    var succeeded = [];
    // Get a new instance
    var db = configuration.newDbInstance({w:1, readConcern: {level: 'majority'}}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);
      test.deepEqual({level: 'majority'}, db.s.readConcern);

      // Get a collection
      var collection = db.collection('readConcernCollectionAggregate1');
      // Validate readConcern
      test.deepEqual({level: 'majority'}, collection.s.readConcern);

      // Listen to apm events
      listener.on('started', function(event) { if(event.commandName == 'aggregate') started.push(event); });
      listener.on('succeeded', function(event) { if(event.commandName == 'aggregate') succeeded.push(event);});

      // Execute find
      collection.aggregate([{$match: {}}, {$out:'readConcernCollectionAggregate1Output'}]).toArray(function(err, r) {
        test.equal(null, err);
        test.equal(1, started.length);
        test.equal('aggregate', started[0].commandName);
        test.equal('aggregate', succeeded[0].commandName);
        test.equal(undefined, started[0].command.readConcern);

        // Execute find
        collection.aggregate([{$match: {}}], {out: 'readConcernCollectionAggregate2Output'}).toArray(function(err, r) {
          test.equal(null, err);
          test.equal(2, started.length);
          test.equal('aggregate', started[1].commandName);
          test.equal('aggregate', succeeded[1].commandName);
          test.equal(undefined, started[1].command.readConcern);

          listener.uninstrument();
          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Should set majority readConcern mapReduce command but be ignored'] = {
  metadata: { requires: { topology: 'replicaset', mongodb: ">= 3.1.9" } },

  test: function(configuration, test) {
    var listener = require('../..').instrument(function(err, instrumentations) {});
    // Contains all the apm events
    var started = [];
    var succeeded = [];
    // Get a new instance
    var db = configuration.newDbInstance({w:1, readConcern: {level: 'majority'}}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);
      test.deepEqual({level: 'majority'}, db.s.readConcern);

      // Get the collection
      var collection = db.collection('test_map_reduce_read_concern');
      collection.insert([{'user_id':1}, {'user_id':2}], configuration.writeConcernMax(), function(err, r) {
        // String functions
        var map = "function() { emit(this.user_id, 1); }";
        var reduce = "function(k,vals) { return 1; }";

        // Listen to apm events
        listener.on('started', function(event) { if(event.commandName == 'mapreduce') started.push(event); });
        listener.on('succeeded', function(event) { if(event.commandName == 'mapreduce') succeeded.push(event);});

        // Execute mapReduce
        collection.mapReduce(map, reduce, {out: {replace : 'tempCollection'}}, function(err, collection) {
          test.equal(null, err);
          test.equal(1, started.length);
          test.equal(1, succeeded.length);
          test.equal('mapreduce', started[0].commandName);
          test.equal('mapreduce', succeeded[0].commandName);
          test.equal(undefined, started[0].command.readConcern);

          listener.uninstrument();
          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Should set majority readConcern distinct command'] = {
  metadata: { requires: { topology: 'replicaset', mongodb: ">= 3.1.8" } },

  test: function(configuration, test) {
    var listener = require('../..').instrument(function(err, instrumentations) {});
    // Contains all the apm events
    var started = [];
    var succeeded = [];
    // Get a new instance
    var db = configuration.newDbInstance({w:1, readConcern: {level: 'majority'}}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);
      test.deepEqual({level: 'majority'}, db.s.readConcern);

      // Get the collection
      var collection = db.collection('test_distinct_read_concern');
      // Insert documents to perform distinct against
      collection.insertMany([{a:0, b:{c:'a'}}, {a:1, b:{c:'b'}}, {a:1, b:{c:'c'}},
        {a:2, b:{c:'a'}}, {a:3}, {a:3}], configuration.writeConcernMax(), function(err, ids) {
        test.equal(null, err);

        // Listen to apm events
        listener.on('started', function(event) { if(event.commandName == 'distinct') started.push(event); });
        listener.on('succeeded', function(event) { if(event.commandName == 'distinct') succeeded.push(event);});

        // Peform a distinct query against the a field
        collection.distinct('a', function(err, docs) {
          test.equal(null, err);
          test.equal(1, started.length);
          test.equal(1, succeeded.length);
          test.equal('distinct', started[0].commandName);
          test.equal('distinct', succeeded[0].commandName);
          test.deepEqual({level:'majority'}, started[0].command.readConcern);

          listener.uninstrument();
          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Should set majority readConcern count command'] = {
  metadata: { requires: { topology: 'replicaset', mongodb: ">= 3.1.8" } },

  test: function(configuration, test) {
    var listener = require('../..').instrument(function(err, instrumentations) {});
    // Contains all the apm events
    var started = [];
    var succeeded = [];
    // Get a new instance
    var db = configuration.newDbInstance({w:1, readConcern: {level: 'majority'}}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);
      test.deepEqual({level: 'majority'}, db.s.readConcern);

      // Get the collection
      var collection = db.collection('test_count_read_concern');
      // Insert documents to perform distinct against
      collection.insertMany([{a:0, b:{c:'a'}}, {a:1, b:{c:'b'}}, {a:1, b:{c:'c'}},
        {a:2, b:{c:'a'}}, {a:3}, {a:3}], configuration.writeConcernMax(), function(err, ids) {
        test.equal(null, err);

        // Listen to apm events
        listener.on('started', function(event) { if(event.commandName == 'count') started.push(event); });
        listener.on('succeeded', function(event) { if(event.commandName == 'count') succeeded.push(event);});

        // Peform a distinct query against the a field
        collection.count({a:1}, function(err, docs) {
          test.equal(null, err);
          test.equal(1, started.length);
          test.equal(1, succeeded.length);
          test.equal('count', started[0].commandName);
          test.equal('count', succeeded[0].commandName);
          test.deepEqual({level:'majority'}, started[0].command.readConcern);

          listener.uninstrument();
          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Should set majority readConcern group command'] = {
  metadata: { requires: { topology: 'replicaset', mongodb: ">= 3.1.8" } },

  test: function(configuration, test) {
    var listener = require('../..').instrument(function(err, instrumentations) {});
    // Contains all the apm events
    var started = [];
    var succeeded = [];
    // Get a new instance
    var db = configuration.newDbInstance({w:1, readConcern: {level: 'majority'}}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);
      test.deepEqual({level: 'majority'}, db.s.readConcern);

      // Get the collection
      var collection = db.collection('test_group_read_concern');
      // Insert documents to perform distinct against
      collection.insertMany([{a:0, b:{c:'a'}}, {a:1, b:{c:'b'}}, {a:1, b:{c:'c'}},
        {a:2, b:{c:'a'}}, {a:3}, {a:3}], configuration.writeConcernMax(), function(err, ids) {
        test.equal(null, err);

        // Listen to apm events
        listener.on('started', function(event) { if(event.commandName == 'group') started.push(event); });
        listener.on('succeeded', function(event) { if(event.commandName == 'group') succeeded.push(event);});

        // Execute group command
        collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }", function(err, results) {
          test.equal(null, err);
          test.equal(1, started.length);
          test.equal(1, succeeded.length);
          test.equal('group', started[0].commandName);
          test.equal('group', succeeded[0].commandName);
          test.deepEqual({level:'majority'}, started[0].command.readConcern);

          listener.uninstrument();
          db.close();
          test.done();
        });
      });
    });
  }
}
exports['Should set majority readConcern parallelCollectionScan command'] = {
  metadata: { requires: { topology: 'replicaset', mongodb: ">= 3.1.8" } },

  test: function(configuration, test) {
    var listener = require('../..').instrument(function(err, instrumentations) {});
    // Contains all the apm events
    var started = [];
    var succeeded = [];
    // Get a new instance
    var db = configuration.newDbInstance({w:1, readConcern: {level: 'majority'}}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);
      test.deepEqual({level: 'majority'}, db.s.readConcern);

      // Get the collection
      var collection = db.collection('test_parallel_collection_scan_read_concern');
      // Insert documents to perform distinct against
      collection.insertMany([{a:0, b:{c:'a'}}, {a:1, b:{c:'b'}}, {a:1, b:{c:'c'}},
        {a:2, b:{c:'a'}}, {a:3}, {a:3}], configuration.writeConcernMax(), function(err, ids) {
        test.equal(null, err);

        // Listen to apm events
        listener.on('started', function(event) { if(event.commandName == 'parallelCollectionScan') started.push(event); });
        listener.on('succeeded', function(event) { if(event.commandName == 'parallelCollectionScan') succeeded.push(event);});

        // Execute parallelCollectionScan command
        collection.parallelCollectionScan({numCursors:1}, function(err, cursors) {
          test.equal(null, err);
          test.equal(1, started.length);
          test.equal(1, succeeded.length);
          test.equal('parallelCollectionScan', started[0].commandName);
          test.equal('parallelCollectionScan', succeeded[0].commandName);
          test.deepEqual({level:'majority'}, started[0].command.readConcern);

          listener.uninstrument();
          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Should set majority readConcern geoNear command'] = {
  metadata: { requires: { topology: 'replicaset', mongodb: ">= 3.1.8" } },

  test: function(configuration, test) {
    var listener = require('../..').instrument(function(err, instrumentations) {});
    // Contains all the apm events
    var started = [];
    var succeeded = [];
    // Get a new instance
    var db = configuration.newDbInstance({w:1, readConcern: {level: 'majority'}}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);
      test.deepEqual({level: 'majority'}, db.s.readConcern);

      // Get the collection
      var collection = db.collection('test_geo_near_concern');

      // Listen to apm events
      listener.on('started', function(event) { if(event.commandName == 'geoNear') started.push(event); });
      listener.on('succeeded', function(event) { if(event.commandName == 'geoNear') succeeded.push(event);});

      // Add a location based index
      collection.ensureIndex({loc:"2d"}, configuration.writeConcernMax(), function(err, result) {

        // Save a new location tagged document
        collection.insertMany([{a:1, loc:[50, 30]}, {a:1, loc:[30, 50]}], configuration.writeConcernMax(), function(err, result) {
          test.equal(null, err);

          // Use geoNear command to find document
          collection.geoNear(50, 50, {query:{a:1}, num:1}, function(err, docs) {
            test.equal(null, err);
            test.equal(1, started.length);
            test.equal(1, succeeded.length);
            test.equal('geoNear', started[0].commandName);
            test.equal('geoNear', succeeded[0].commandName);
            test.deepEqual({level:'majority'}, started[0].command.readConcern);

            listener.uninstrument();
            db.close();
            test.done();
          });
        });
      });
    });
  }
}

exports['Should set majority readConcern geoSearch command'] = {
  metadata: { requires: { topology: 'replicaset', mongodb: ">= 3.1.8" } },

  test: function(configuration, test) {
    var listener = require('../..').instrument(function(err, instrumentations) {});
    // Contains all the apm events
    var started = [];
    var succeeded = [];
    // Get a new instance
    var db = configuration.newDbInstance({w:1, readConcern: {level: 'majority'}}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);
      test.deepEqual({level: 'majority'}, db.s.readConcern);

      // Get the collection
      var collection = db.collection('test_geo_search_read_concern');

      // Listen to apm events
      listener.on('started', function(event) { if(event.commandName == 'geoSearch') started.push(event); });
      listener.on('succeeded', function(event) { if(event.commandName == 'geoSearch') succeeded.push(event);});

      // Add a location based index
      collection.ensureIndex({loc: "geoHaystack", type: 1}, {bucketSize: 1}, function(err, result) {

        // Save a new location tagged document
        collection.insertMany([{a:1, loc:[50, 30]}, {a:1, loc:[30, 50]}], configuration.writeConcernMax(), function(err, result) {
          test.equal(null, err);

          // Use geoNear command to find document
          collection.geoHaystackSearch(50, 50, {search:{a:1}, limit:1, maxDistance:100}, function(err, docs) {
            test.equal(null, err);
            test.equal(1, started.length);
            test.equal(1, succeeded.length);
            test.equal('geoSearch', started[0].commandName);
            test.equal('geoSearch', succeeded[0].commandName);
            test.deepEqual({level:'majority'}, started[0].command.readConcern);

            listener.uninstrument();
            db.close();
            test.done();
          });
        });
      });
    });
  }
}
