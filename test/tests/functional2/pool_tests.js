"use strict";

var f = require('util').format;

exports['Should correctly connect pool to single server'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib2/connection/pool')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
      , messageHandler: function() {}
    })

    // Add event listeners
    pool.on('connect', function(_pool) {
      _pool.destroy();
      test.done();
    })

    // Start connection
    pool.connect();
  }
}

exports['Should correctly write ismaster operation to the server'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib2/connection/pool')
      , bson = require('bson').BSONPure.BSON
      , Query = require('../../../lib2/connection/commands').Query;

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    pool.on('connect', function(_pool) {
      var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
      _pool.write(query.toBin(), function(err, result) {
        test.equal(null, err);
        test.equal(true, result.result.ismaster);
        _pool.destroy();
        test.done();
      });
    })

    // Start connection
    pool.connect();
  }
}

exports['Should correctly grow server pool on concurrent operations'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib2/connection/pool')
      , bson = require('bson').BSONPure.BSON
      , Query = require('../../../lib2/connection/commands').Query;

    // Index
    var index = 0;

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    var messageHandler = function(err, result) {
      index = index + 1;
      // console.dir(response.documents)
      test.equal(true, result.result.ismaster);
      // Did we receive an answer for all the messages
      if(index == 100) {
        test.equal(5, pool.socketCount());

        pool.destroy();
        test.done();
      }
    }

    // Add event listeners
    pool.on('connect', function(_pool) {
      for(var i = 0; i < 10; i++)
      process.nextTick(function() {
        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)

        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)

        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)

        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)

        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)

        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)

        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)

        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)

        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)

        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)
      })
    })

    // Start connection
    pool.connect();
  }
}

exports['Should correctly write ismaster operation to the server and handle timeout'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib2/connection/pool')
      , bson = require('bson').BSONPure.BSON
      , Query = require('../../../lib2/connection/commands').Query;

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , socketTimeout: 3000
      , bson: new bson()
    })

    // Add event listeners
    pool.on('connect', function(_pool) {
      var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
      _pool.write(query.toBin(), function() {});
    })

    pool.on('timeout', function(_pool) {
      pool.destroy();
      test.done();
    });

    // Start connection
    pool.connect();
  }
}

exports['Should correctly reclaim immediateRelease socket'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib2/connection/pool')
      , bson = require('bson').BSONPure.BSON
      , Query = require('../../../lib2/connection/commands').Query;

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , socketTimeout: 1000
      , bson: new bson()
      , messageHandler: function(response) {
        pool.destroy();
        test.done();
      }
    })

    var index = 0;

    // Add event listeners
    pool.on('connect', function(_pool) {
      var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
      _pool.write(query.toBin(), {immediateRelease: true}, function() {
        index = index + 1;
      });

      test.equal(1, pool.availableConnections.length);
    })

    pool.on('timeout', function(err, _pool) {
      test.equal(0, index);

      pool.destroy();
      test.done();
    });

    // Start connection
    pool.connect();
  }
}

function executeCommand(configuration, db, cmd, cb) {
  var Pool = require('../../../lib2/connection/pool')
    , MongoError = require('../../../lib2/error')
    , bson = require('bson').BSONPure.BSON
    , Query = require('../../../lib2/connection/commands').Query;

  // Attempt to connect
  var pool = new Pool({
    host: configuration.host, port: configuration.port, bson: new bson()
  });

  // Add event listeners
  pool.on('connect', function(_pool) {
    var query = new Query(new bson(), f('%s.$cmd', db), cmd, {numberToSkip: 0, numberToReturn: 1});
    _pool.write(query.toBin(), {}, function(err, result) {
      // Close the pool
      _pool.destroy();
      // If we have an error return
      if(err) return cb(err);
      // Return the result
      cb(null, result.result);
    });
  });

  pool.connect();
}

exports['Should correctly authenticate using scram-sha-1 using connect auth'] = {
  metadata: { requires: { topology: "auth", mongodb: ">=3.0.0" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib2/connection/pool')
      , bson = require('bson').BSONPure.BSON
      , Query = require('../../../lib2/connection/commands').Query;

    executeCommand(configuration, 'admin', {
      createUser: 'root',
      pwd: "root",
      roles: [ { role: "root", db: "admin" } ],
      digestPassword: true
    }, function(err, r) {
      test.equal(null, err);
      // Attempt to connect
      var pool = new Pool({
        host: configuration.host, port: configuration.port, bson: new bson()
      })

      // Add event listeners
      pool.on('connect', function(_pool) {
        _pool.destroy();
        test.done();
      })

      // // Add event listeners
      // pool.on('error', function(err) {
      //   console.log("============ ERROR")
      //   console.log(err.stack)
      //   process.exit(0)
      //   pool.destroy();
      //   test.done();
      // })

      // Start connection
      pool.connect('scram-sha-1', 'admin', 'root', 'root');
    });
  }
}

// exports['Should correctly authenticate using scram-sha-1 using auth method'] = {
//   metadata: { requires: { topology: "auth", mongodb: ">=3.0.0" } },
//
//   test: function(configuration, test) {
//     var Pool = require('../../../lib2/connection/pool')
//       , bson = require('bson').BSONPure.BSON;
//
//     // Attempt to connect
//     var pool = new Pool({
//         host: configuration.host
//       , port: configuration.port
//       , bson: bson
//     })
//
//     // Add event listeners
//     pool.on('connect', function(_pool) {
//       _pool.destroy();
//       test.done();
//     })
//
//     // Start connection
//     pool.connect();
//   }
// }
