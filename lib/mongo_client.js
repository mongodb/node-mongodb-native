"use strict";

var parse = require('./url_parser')
  , Server = require('./server')
  , Mongos = require('./mongos')
  , ReplSet = require('./replset')
  , Define = require('./metadata')
  , ReadPreference = require('./read_preference')
  , Db = require('./db');

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

var connect = function(url, options, callback) {
  var serverOptions = options.server || {};
  var mongosOptions = options.mongos || {};
  var replSetServersOptions = options.replSet || options.replSetServers || {};
  var dbOptions = options.db || {};

  // If callback is null throw an exception
  if(callback == null)
    throw new Error("no callback function provided");

  // Parse the string
  var object = parse(url, options);

  // Merge in any options for db in options object
  if(dbOptions) {
    for(var name in dbOptions) object.db_options[name] = dbOptions[name];
  }

  // Added the url to the options
  object.db_options.url = url;

  // Merge in any options for server in options object
  if(serverOptions) {
    for(var name in serverOptions) object.server_options[name] = serverOptions[name];
  }

  // Merge in any replicaset server options
  if(replSetServersOptions) {
    for(var name in replSetServersOptions) object.rs_options[name] = replSetServersOptions[name];
  }

  if(replSetServersOptions.ssl
    || replSetServersOptions.sslValidate
    || replSetServersOptions.sslCA
    || replSetServersOptions.sslCert
    || replSetServersOptions.sslKey
    || replSetServersOptions.sslPass) {
    object.server_options.ssl = replSetServersOptions.ssl;
    object.server_options.sslValidate = replSetServersOptions.sslValidate;
    object.server_options.sslCA = replSetServersOptions.sslCA;
    object.server_options.sslCert = replSetServersOptions.sslCert;
    object.server_options.sslKey = replSetServersOptions.sslKey;
    object.server_options.sslPass = replSetServersOptions.sslPass;
  }

  // Merge in any replicaset server options
  if(mongosOptions) {
    for(var name in mongosOptions) object.mongos_options[name] = mongosOptions[name];
  }

  if(typeof object.server_options.poolSize == 'number') {
    if(!object.mongos_options.poolSize) object.mongos_options.poolSize = object.server_options.poolSize;
    if(!object.rs_options.poolSize) object.rs_options.poolSize = object.server_options.poolSize;
  }

  if(mongosOptions.ssl
    || mongosOptions.sslValidate
    || mongosOptions.sslCA
    || mongosOptions.sslCert
    || mongosOptions.sslKey
    || mongosOptions.sslPass) {
    object.server_options.ssl = mongosOptions.ssl;
    object.server_options.sslValidate = mongosOptions.sslValidate;
    object.server_options.sslCA = mongosOptions.sslCA;
    object.server_options.sslCert = mongosOptions.sslCert;
    object.server_options.sslKey = mongosOptions.sslKey;
    object.server_options.sslPass = mongosOptions.sslPass;
  }

  // Set the promise library
  object.db_options.promiseLibrary = options.promiseLibrary;

  // We need to ensure that the list of servers are only either direct members or mongos
  // they cannot be a mix of monogs and mongod's
  var totalNumberOfServers = object.servers.length;
  var totalNumberOfMongosServers = 0;
  var totalNumberOfMongodServers = 0;
  var serverConfig = null;
  var errorServers = {};

  // Failure modes
  if(object.servers.length == 0) throw new Error("connection string must contain at least one seed host");

  // If we have no db setting for the native parser try to set the c++ one first
  object.db_options.native_parser = _setNativeParser(object.db_options);
  // If no auto_reconnect is set, set it to true as default for single servers
  if(typeof object.server_options.auto_reconnect != 'boolean') {
    object.server_options.auto_reconnect = true;
  }

  // If we have more than a server, it could be replicaset or mongos list
  // need to verify that it's one or the other and fail if it's a mix
  // Connect to all servers and run ismaster
  for(var i = 0; i < object.servers.length; i++) {
    // Set up socket options
    var providedSocketOptions = object.server_options.socketOptions || {};

    var _server_options = {
        poolSize:1
      , socketOptions: {
          connectTimeoutMS: providedSocketOptions.connectTimeoutMS || 30000
        , socketTimeoutMS:  providedSocketOptions.socketTimeoutMS || 30000
      }
      , auto_reconnect:false};

    // Ensure we have ssl setup for the servers
    if(object.server_options.ssl) {
      _server_options.ssl = object.server_options.ssl;
      _server_options.sslValidate = object.server_options.sslValidate;
      _server_options.sslCA = object.server_options.sslCA;
      _server_options.sslCert = object.server_options.sslCert;
      _server_options.sslKey = object.server_options.sslKey;
      _server_options.sslPass = object.server_options.sslPass;
    } else if(object.rs_options.ssl) {
      _server_options.ssl = object.rs_options.ssl;
      _server_options.sslValidate = object.rs_options.sslValidate;
      _server_options.sslCA = object.rs_options.sslCA;
      _server_options.sslCert = object.rs_options.sslCert;
      _server_options.sslKey = object.rs_options.sslKey;
      _server_options.sslPass = object.rs_options.sslPass;
    }

    // Error
    var error = null;
    // Set up the Server object
    var _server = object.servers[i].domain_socket
        ? new Server(object.servers[i].domain_socket, _server_options)
        : new Server(object.servers[i].host, object.servers[i].port, _server_options);

    var connectFunction = function(__server) {
      // Attempt connect
      new Db(object.dbName, __server, {w:1, native_parser:false, promiseLibrary:options.promiseLibrary}).open(function(err, db) {
        // Update number of servers
        totalNumberOfServers = totalNumberOfServers - 1;
        
        // If no error do the correct checks
        if(!err) {
          // Close the connection
          db.close();
          var isMasterDoc = db.serverConfig.isMasterDoc;
          
          // Check what type of server we have
          if(isMasterDoc.setName) {
            totalNumberOfMongodServers++;
          }

          if(isMasterDoc.msg && isMasterDoc.msg == "isdbgrid") totalNumberOfMongosServers++;
        } else {
          error = err;
          errorServers[__server.host + ":" + __server.port] = __server;
        }

        if(totalNumberOfServers == 0) {
          // Error out
          if(totalNumberOfMongodServers == 0 && totalNumberOfMongosServers == 0 && error) {
            return callback(error, null);
          }

          // If we have a mix of mongod and mongos, throw an error
          if(totalNumberOfMongosServers > 0 && totalNumberOfMongodServers > 0) {
            if(db) db.close();
            return process.nextTick(function() {
              try {
                callback(new Error("cannot combine a list of replicaset seeds and mongos seeds"));
              } catch (err) {
                throw err
              }
            })
          }

          if(totalNumberOfMongodServers == 0
            && totalNumberOfMongosServers == 0
            && object.servers.length == 1
            && (!object.rs_options.replicaSet || !object.rs_options.rs_name)) {
            
            var obj = object.servers[0];
            serverConfig = obj.domain_socket ?
                new Server(obj.domain_socket, object.server_options)
              : new Server(obj.host, obj.port, object.server_options);
          
          } else if(totalNumberOfMongodServers > 0
            || totalNumberOfMongosServers > 0
            || object.rs_options.replicaSet || object.rs_options.rs_name) {
            
            var finalServers = object.servers
              .filter(function(serverObj) {
                return errorServers[serverObj.host + ":" + serverObj.port] == null;
              })
              .map(function(serverObj) {
                return new Server(serverObj.host, serverObj.port, object.server_options);
              });

            // Clean out any error servers
            errorServers = {};

            // Set up the final configuration
            if(totalNumberOfMongodServers > 0) {
              try {
                
                // If no replicaset name was provided, we wish to perform a
                // direct connection
                if(totalNumberOfMongodServers == 1 
                  && (!object.rs_options.replicaSet && !object.rs_options.rs_name)) {
                  serverConfig = finalServers[0];
                } else if(totalNumberOfMongodServers == 1) {
                  object.rs_options.replicaSet = object.rs_options.replicaSet || object.rs_options.rs_name;
                  serverConfig = new ReplSet(finalServers, object.rs_options);
                } else {
                  serverConfig = new ReplSet(finalServers, object.rs_options);                  
                }

              } catch(err) {
                return callback(err, null);
              }
            } else {
              serverConfig = new Mongos(finalServers, object.mongos_options);
            }
          }

          if(serverConfig == null) {
            return process.nextTick(function() {
              try {
                callback(new Error("Could not locate any valid servers in initial seed list"));
              } catch (err) {
                if(db) db.close();
                throw err
              }
            });
          }

          // Ensure no firing of open event before we are ready
          serverConfig.emitOpen = false;
          // Set up all options etc and connect to the database
          _finishConnecting(serverConfig, object, options, callback)
        }
      });
    }

    // Wrap the context of the call
    connectFunction(_server);
  }
}

var _setNativeParser = function(db_options) {
  if(typeof db_options.native_parser == 'boolean') return db_options.native_parser;

  try {
    require('mongodb-core').BSON.BSONNative.BSON;
    return true;
  } catch(err) {
    return false;
  }
}

var _finishConnecting = function(serverConfig, object, options, callback) {
  // If we have a readPreference passed in by the db options
  if(typeof object.db_options.readPreference == 'string') {
    object.db_options.readPreference = new ReadPreference(object.db_options.readPreference);
  } else if(typeof object.db_options.read_preference == 'string') {
    object.db_options.readPreference = new ReadPreference(object.db_options.read_preference);
  }

  // Do we have readPreference tags
  if(object.db_options.readPreference && object.db_options.readPreferenceTags) {
    object.db_options.readPreference.tags = object.db_options.readPreferenceTags;
  } else if(object.db_options.readPreference && object.db_options.read_preference_tags) {
    object.db_options.readPreference.tags = object.db_options.read_preference_tags;
  }

  // Get the socketTimeoutMS
  var socketTimeoutMS = object.server_options.socketOptions.socketTimeoutMS || 0;

  // If we have a replset, override with replicaset socket timeout option if available
  if(serverConfig instanceof ReplSet) {
    socketTimeoutMS = object.rs_options.socketOptions.socketTimeoutMS || socketTimeoutMS;
  }

  // Set socketTimeout to the same as the connectTimeoutMS or 30 sec
  serverConfig.connectTimeoutMS = serverConfig.connectTimeoutMS || 30000;
  serverConfig.socketTimeoutMS = serverConfig.connectTimeoutMS;

  // Set up the db options
  var db = new Db(object.dbName, serverConfig, object.db_options);
  // Open the db
  db.open(function(err, db){

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

    // Reset the socket timeout
    serverConfig.socketTimeoutMS = socketTimeoutMS || 0;

    // Return object
    if(err == null && object.auth){
      // What db to authenticate against
      var authentication_db = db;
      if(object.db_options && object.db_options.authSource) {
        authentication_db = db.db(object.db_options.authSource);
      }

      // Build options object
      var options = {};
      if(object.db_options.authMechanism) options.authMechanism = object.db_options.authMechanism;
      if(object.db_options.gssapiServiceName) options.gssapiServiceName = object.db_options.gssapiServiceName;

      // Authenticate
      authentication_db.authenticate(object.auth.user, object.auth.password, options, function(err, success){
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
              callback(err ? err : new Error('Could not authenticate user ' + object.auth[0]), null);
            } catch (err) {
              if(db) db.close();
              throw err
            }
          });
        }
      });
    } else {
      process.nextTick(function() {
        try {
          callback(err, db);
        } catch (err) {
          if(db) db.close();
          throw err
        }
      })
    }
  });
}

module.exports = MongoClient
