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
  _finalOptions = createUnifiedOptions(_finalOptions, options);

  // Check if we have connection and socket timeout set
  if(!_finalOptions.socketTimeoutMS) _finalOptions.socketTimeoutMS = 120000;
  if(!_finalOptions.connectTimeoutMS) _finalOptions.connectTimeoutMS = 120000;

  // We need to ensure that the list of servers are only either direct members or mongos
  // they cannot be a mix of monogs and mongod's
  var totalNumberOfServers = object.servers.length;
  var totalNumberOfMongosServers = 0;
  var totalNumberOfMongodServers = 0;
  var serverConfig = null;
  var errorServers = {};

  // Failure modes
  if(object.servers.length == 0) {
    throw new Error("connection string must contain at least one seed host");
  }

  // If we have more than a server, it could be replicaset or mongos list
  // need to verify that it's one or the other and fail if it's a mix
  // Connect to all servers and run ismaster
  for(var i = 0; i < object.servers.length; i++) {
    // Set up socket options
    var _server_options = {
        poolSize:1
      , socketOptions: {
          connectTimeoutMS: _finalOptions.connectTimeoutMS || (1000 * 120)
        , socketTimeoutMS:  _finalOptions.socketTimeoutMS || (1000 * 120)
      }
      , auto_reconnect:false
      , monitoring: false };

    // Ensure we have ssl setup for the servers
    if(_finalOptions.ssl) {
      _server_options.ssl = _finalOptions.ssl;
      _server_options.sslValidate = _finalOptions.sslValidate;
      _server_options.checkServerIdentity = _finalOptions.checkServerIdentity;
      _server_options.sslCA = _finalOptions.sslCA;
      _server_options.sslCert = _finalOptions.sslCert;
      _server_options.sslKey = _finalOptions.sslKey;
      _server_options.sslPass = _finalOptions.sslPass;
    }

    // Error
    var error = null;
    // Set up the Server object
    var _server = object.servers[i].domain_socket
        ? new Server(object.servers[i].domain_socket, _server_options)
        : new Server(object.servers[i].host, object.servers[i].port, _server_options);

    var connectFunction = function(__server) {
      // Attempt connect
      new Db(object.dbName, __server, {w:1, native_parser:false}).open(function(err, db) {
        // Update number of servers
        totalNumberOfServers = totalNumberOfServers - 1;

        // If no error do the correct checks
        if(!err) {
          // Close the connection
          db.close();
          // Get the last ismaster document
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
            && (!_finalOptions.replicaSet || !_finalOptions.rs_name)) {

            var obj = object.servers[0];
            serverConfig = obj.domain_socket ?
                new Server(obj.domain_socket, _finalOptions)
              : new Server(obj.host, obj.port, _finalOptions);

          } else if(totalNumberOfMongodServers > 0
            || totalNumberOfMongosServers > 0
            || _finalOptions.replicaSet || _finalOptions.rs_name) {

            // No auto reconnect
            _finalOptions.autoReconnect = false;
            _finalOptions.monitoring = false;

            // Map the final server instances
            var finalServers = object.servers
              .filter(function(serverObj) {
                return errorServers[serverObj.host + ":" + serverObj.port] == null;
              })
              .map(function(serverObj) {
                return serverObj.domain_socket ?
                  new Server(serverObj.domain_socket, 27017, _finalOptions)
                : new Server(serverObj.host, serverObj.port, _finalOptions);
              });

            // Clean out any error servers
            errorServers = {};

            // Set up the final configuration
            if(totalNumberOfMongodServers > 0) {
              try {
                // If no replicaset name was provided, we wish to perform a
                // direct connection
                if(totalNumberOfMongodServers == 1
                  && (!_finalOptions.replicaSet && !_finalOptions.rs_name)) {
                  serverConfig = finalServers[0];
                } else if(totalNumberOfMongodServers == 1) {
                  _finalOptions.replicaSet = _finalOptions.replicaSet || _finalOptions.rs_name;
                  serverConfig = new ReplSet(finalServers, _finalOptions);
                } else {
                  serverConfig = new ReplSet(finalServers, _finalOptions);
                }

              } catch(err) {
                return callback(err, null);
              }
            } else {
              serverConfig = new Mongos(finalServers, _finalOptions);
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

          // Get ismaster
          var ismaster = __server.lastIsMaster();

          // No hosts list, connect directly to the server
          if(!ismaster.hosts) {
            return _finishConnecting(serverConfig, object, _finalOptions, callback)
          }

          var resolveDNS = function(host, callback) {
            // Split the host address (get the domain only)
            var host = host.split(/\:/)[0];
            // Attempt to lookup the domain
            dns.lookup(host, function(err, r) {
              if(err && logger.isError()) {
                logger.error(f('failed to resolve host [%s]', err));
              }

              callback(err, r);
            });
          }

          // Validate the DNS addresses passed back in the hosts list
          var count = ismaster.hosts.length;
          // Attempt to resolve the DNS address for each host
          for(var i = 0; i < ismaster.hosts.length; i++) {
            resolveDNS(ismaster.hosts[i], function(err, r) {
              count = count - 1;

              if(count == 0) {
                _finishConnecting(serverConfig, object, _finalOptions, callback);
              }
            });
          }
        }
      });
    }

    // Wrap the context of the call
    connectFunction(_server);
  }
}

var _finishConnecting = function(serverConfig, object, options, callback) {
  // If we have a readPreference passed in by the db options
  if(typeof options.readPreference == 'string') {
    options.readPreference = new ReadPreference(options.readPreference);
  } else if(typeof options.read_preference == 'string') {
    options.readPreference = new ReadPreference(options.read_preference);
  }

  // Do we have readPreference tags
  if(options.readPreference && options.readPreferenceTags) {
    options.readPreference.tags = options.readPreferenceTags;
  } else if(options.readPreference && options.read_preference_tags) {
    options.readPreference.tags = options.read_preference_tags;
  }

  // Get the socketTimeoutMS
  var socketTimeoutMS = options.socketTimeoutMS || 0;

  // If we have a replset, override with replicaset socket timeout option if available
  if(serverConfig instanceof ReplSet) {
    socketTimeoutMS = options.socketTimeoutMS || socketTimeoutMS;
  }

  // Set socketTimeout to the same as the connectTimeoutMS or 30 sec
  serverConfig.connectTimeoutMS = serverConfig.connectTimeoutMS || 30000;
  serverConfig.socketTimeoutMS = serverConfig.connectTimeoutMS;

  // Set up the db options
  var db = new Db(object.dbName, serverConfig, options);
  // Open the db
  db.open(function(err, db) {
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
