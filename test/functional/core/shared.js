'use strict';
const EventEmitter = require('events');
const { ConnectionPool } = require('../../../src/cmap/connection_pool');
const { format: f } = require('util');
const { Query } = require('../../../src/cmap/commands');

function executeCommand(configuration, db, cmd, options, cb) {
  // Optional options
  if (typeof options === 'function') (cb = options), (options = {});
  // Set the default options object if none passed in
  options = options || {};

  // Alternative options
  var host = options.host || configuration.host;
  var port = options.port || configuration.port;

  // Attempt to connect
  var pool = new ConnectionPool(null, {
    host: host,
    port: port
  });

  // Add event listeners
  pool.on('connect', function (_pool) {
    var query = new Query(f('%s.$cmd', db), cmd, {
      numberToSkip: 0,
      numberToReturn: 1
    });

    _pool.write(
      query,
      {
        command: true
      },
      function (err, result) {
        if (err) console.error(err.stack);
        // Close the pool
        _pool.destroy();
        // If we have an error return
        if (err) return cb(err);
        // Return the result
        cb(null, result.result);
      }
    );
  });

  pool.connect(options.credentials);
}

function locateAuthMethod(configuration, cb) {
  var ConnectionPool = require('../../../src/cmap/connection_pool'),
    f = require('util').format,
    { Query } = require('../../../src/cmap/commands');

  // Set up operations
  var db = 'admin';
  var cmd = { ismaster: true };

  // Attempt to connect
  var pool = new ConnectionPool(null, {
    host: configuration.host,
    port: configuration.port
  });

  // Add event listeners
  pool.on('connect', function (_pool) {
    var query = new Query(f('%s.$cmd', db), cmd, {
      numberToSkip: 0,
      numberToReturn: 1
    });
    _pool.write(
      query,
      {
        command: true
      },
      function (err, result) {
        if (err) console.error(err.stack);
        // Close the pool
        _pool.destroy();
        // If we have an error return
        if (err) return cb(err);

        // Establish the type of auth method
        if (!result.result.maxWireVersion || result.result.maxWireVersion === 2) {
          cb(null, 'mongocr');
        } else {
          cb(null, 'scram-sha-1');
        }
      }
    );
  });

  pool.connect.apply(pool);
}

const delay = function (timeout) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve();
    }, timeout);
  });
};

class ConnectionSpy extends EventEmitter {
  constructor() {
    super();
    this.connections = {};
  }

  addConnection(id, connection) {
    // console.log(`=== added connection ${id} :: ${connection.port}`);

    this.connections[id] = connection;
    this.emit('connectionAdded');
  }

  deleteConnection(id) {
    // console.log(
    //   `=== deleted connection ${id} :: ${this.connections[id] ? this.connections[id].port : ''}`
    // );

    delete this.connections[id];
    this.emit('connectionRemoved');

    if (this.connectionCount() === 0) {
      this.emit('drained');
    }
  }

  connectionCount() {
    return Object.keys(this.connections).length;
  }
}

module.exports = {
  executeCommand,
  locateAuthMethod,
  delay,
  ConnectionSpy
};
