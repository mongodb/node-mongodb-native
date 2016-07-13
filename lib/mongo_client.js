"use strict";

var parse = require('./url_parser')
  , Server = require('./server')
  , Mongos = require('./mongos')
  , ReplSet = require('./replset')
  , Define = require('./metadata')
  , ReadPreference = require('./read_preference')
  , Logger = require('mongodb-core').Logger
  , Db = require('./db')
  , dns = require('dns')
  , f = require('util').format 
  , shallowClone = require('./utils').shallowClone;

/**
 * @fileOverview The **MongoClient** class is a class that allows for making Connections to MongoDB.
 *
 * @example
 * var MongoClient = require('mongodb').MongoClient,
 *   test = require('assert');
 * // Connection url
 * var url = 'mongodb://localhost:27017/test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, db) {
 *   // Get an additional db
 *   db.close();
 * });
 */

/**
 * Creates a new MongoClient instance
 * @class
 * @return {MongoClient} a MongoClient instance.
 */
function MongoClient() {
  /**
   * The callback format for results
   * @callback MongoClient~connectCallback
   * @param {MongoError} error An error instance representing the error during the execution.
   * @param {Db} db The connected database.
   */

  /**
   * Connect to MongoDB using a url as documented at
   *
   *  docs.mongodb.org/manual/reference/connection-string/
   *
   * Note that for replicasets the replicaSet query parameter is required in the 2.0 driver
   *
   * @method
   * @param {string} url The connection URI string
   * @param {object} [options=null] Optional settings.
   * @param {boolean} [options.uri_decode_auth=false] Uri decode the user name and password for authentication
   * @param {object} [options.db=null] A hash of options to set on the db object, see **Db constructor**
   * @param {object} [options.server=null] A hash of options to set on the server objects, see **Server** constructor**
   * @param {object} [options.replSet=null] A hash of options to set on the replSet object, see **ReplSet** constructor**
   * @param {object} [options.mongos=null] A hash of options to set on the mongos object, see **Mongos** constructor**
   * @param {object} [options.promiseLibrary=null] A Promise library class the application wishes to use such as Bluebird, must be ES6 compatible
   * @param {MongoClient~connectCallback} [callback] The command result callback
   * @return {Promise} returns Promise if no callback passed
   */
  this.connect = MongoClient.connect;
}

var define = MongoClient.define = new Define('MongoClient', MongoClient, false);

/**
 * Connect to MongoDB using a url as documented at
 *
 *  docs.mongodb.org/manual/reference/connection-string/
 *
 * Note that for replicasets the replicaSet query parameter is required in the 2.0 driver
 *
 * @method
 * @static
 * @param {string} url The connection URI string
 * @param {object} [options=null] Optional settings.
 * @param {boolean} [options.uri_decode_auth=false] Uri decode the user name and password for authentication
 * @param {object} [options.db=null] A hash of options to set on the db object, see **Db constructor**
 * @param {object} [options.server=null] A hash of options to set on the server objects, see **Server** constructor**
 * @param {object} [options.replSet=null] A hash of options to set on the replSet object, see **ReplSet** constructor**
 * @param {object} [options.mongos=null] A hash of options to set on the mongos object, see **Mongos** constructor**
 * @param {object} [options.promiseLibrary=null] A Promise library class the application wishes to use such as Bluebird, must be ES6 compatible
 * @param {MongoClient~connectCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
MongoClient.connect = function(url, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] == 'function' ? args.pop() : null;
  options = args.length ? args.shift() : null;
  options = options || {};

  // Get the promiseLibrary
  var promiseLibrary = options.promiseLibrary;

  // No promise library selected fall back
  if(!promiseLibrary) {
    promiseLibrary = typeof global.Promise == 'function' ?
      global.Promise : require('es6-promise').Promise;
  }

  // Return a promise
  if(typeof callback != 'function') {
    return new promiseLibrary(function(resolve, reject) {
      connect(url, options, function(err, db) {
        if(err) return reject(err);
        resolve(db);
      });
    });
  }

  // Fallback to callback based connect
  connect(url, options, callback);
}

define.staticMethod('connect', {callback: true, promise:true});

var mergeOptions = function(target, source, flatten) {
  for(var name in source) {
    if(source[name] && typeof source[name] == 'object' && flatten) {
      target = mergeOptions(target, source[name], flatten);
    } else {
      target[name] = source[name];
    }
  }

  return target;
}

var createUnifiedOptions = function(finalOptions, options) {
  var childOptions = ['mongos', 'server', 'db'
    , 'replset', 'db_options', 'server_options', 'rs_options', 'mongos_options'];

  for(var name in options) {
    if(childOptions.indexOf(name.toLowerCase()) != -1) {
      finalOptions = mergeOptions(finalOptions, options[name], false);
    } else {
      if(options[name] && typeof options[name] == 'object' && !Buffer.isBuffer(options[name]) && !Array.isArray(options[name])) {
        finalOptions = mergeOptions(finalOptions, options[name], true);
      } else {
        finalOptions[name] = options[name];
      }
    }
  }

  return finalOptions;
}

function translateOptions(options) {
  // If we have a readPreference passed in by the db options
  if(typeof options.readPreference == 'string' || typeof options.read_preference == 'string') {
    options.readPreference = new ReadPreference(options.readPreference || options.read_preference);
  }

  // Do we have readPreference tags, add them
  if(options.readPreference && (options.readPreferenceTags || options.read_preference_tags)) {
    options.readPreference.tags = options.readPreferenceTags || options.read_preference_tags;
  }

  // Set the socket and connection timeouts
  if(!options.socketTimeoutMS) options.socketTimeoutMS = 30000;
  if(!options.connectTimeoutMS) options.connectTimeoutMS = 30000;

  // Create server instances
  return options.servers.map(function(serverObj) {
    return serverObj.domain_socket ?
      new Server(serverObj.domain_socket, 27017, options)
    : new Server(serverObj.host, serverObj.port, options);
  });
}

function createReplicaset(options, callback) {
  // Set default options
  var servers = translateOptions(options);
  // Create Db instance
  new Db(options.dbName, new ReplSet(servers, options), options).open(callback);
}

function createMongos(options, callback) {
  // Set default options
  var servers = translateOptions(options);
  // Create Db instance
  new Db(options.dbName, new Mongos(servers, options), options).open(callback);
}

function createServer(options, callback) {
  // Set default options
  var servers = translateOptions(options);
  // Create Db instance
  new Db(options.dbName, servers[0], options).open(callback);
}

function connectHandler(options, callback) {
  return function (err, db) {
    if(err) {
      return process.nextTick(function() {
        try {
          callback(err, null);
        } catch (err) {
          if(db) db.close();
          throw err
        }
      });
    }

    // No authentication just reconnect
    if(!options.auth) {
      return process.nextTick(function() {
        try {
          callback(err, db);
        } catch (err) {
          if(db) db.close();
          throw err
        }
      })
    }

    // What db to authenticate against
    var authentication_db = db;
    if(options.authSource) {
      authentication_db = db.db(options.authSource);
    }

    // Authenticate
    authentication_db.authenticate(options.user, options.password, options, function(err, success){
      if(success){
        process.nextTick(function() {
          try {
            callback(null, db);
          } catch (err) {
            if(db) db.close();
            throw err
          }
        });
      } else {
        if(db) db.close();
        process.nextTick(function() {
          try {
            callback(err ? err : new Error('Could not authenticate user ' + options.auth[0]), null);
          } catch (err) {
            if(db) db.close();
            throw err
          }
        });
      }
    });
  }
}

/*
 * Connect using MongoClient
 */
var connect = function(url, options, callback) {
  options = options || {};
  options = shallowClone(options);

  // If callback is null throw an exception
  if(callback == null) {
    throw new Error("no callback function provided");
  }

  // Get a logger for MongoClient
  var logger = Logger('MongoClient', options);

  // Parse the string
  var object = parse(url, options);
  var _finalOptions = createUnifiedOptions({}, object);
  _finalOptions = mergeOptions(_finalOptions, object, false);
  _finalOptions = createUnifiedOptions(_finalOptions, options);

  // Check if we have connection and socket timeout set
  if(!_finalOptions.socketTimeoutMS) _finalOptions.socketTimeoutMS = 120000;
  if(!_finalOptions.connectTimeoutMS) _finalOptions.connectTimeoutMS = 120000;

  // Failure modes
  if(object.servers.length == 0) {
    throw new Error("connection string must contain at least one seed host");
  }

  // Do we have a replicaset then skip discovery and go straight to connectivity
  if(_finalOptions.replicaSet || _finalOptions.rs_name) {
    return createReplicaset(_finalOptions, connectHandler(_finalOptions, callback));
  } else if(object.servers.length > 1) {
    return createMongos(_finalOptions, connectHandler(_finalOptions, callback));
  } else {
    return createServer(_finalOptions, connectHandler(_finalOptions, callback));
  }
}

module.exports = MongoClient
