var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , CServer = require('mongodb-core').Server
  , shallowClone = require('./utils').shallowClone;

var Server = function(host, port, options) {
  if(!(this instanceof Server)) return new Server(host, port, options);
  EventEmitter.call(this);

  var self = this;
  // Clone options
  var clonedOptions = shallowClone(options);
  clonedOptions.host = host;
  clonedOptions.port = port;

  // Create an instance of a server instance from mongodb-core
  var server = new CServer(clonedOptions);

  // Last ismaster
  Object.defineProperty(this, 'isMasterDoc', {
    enumerable:true,
    get: function() {
      return server.lastIsMaster();
    }
  });  

  // Connect
  this.connect = function(dbInstance, _options, callback) {
    if('function' === typeof _options) callback = _options, _options = {};
    if(_options == null) _options = {};
    if(!('function' === typeof callback)) callback = null;
    options = _options;

    // Error handler
    var connectErrorHandler = function(event) {
      return function(err) {
        ['timeout', 'error', 'close'].forEach(function(e) {
          server.removeListener(e, connectErrorHandler);
        });
        server.removeListener('connect', connectErrorHandler);
        callback(err);
      }
    }

    // Actual handler
    var errorHandler = function(event) {
      return function(err) {
        if(event != 'error') {
          self.emit(event, err);
        }
      }
    }

    // Connect handler
    var connectHandler = function() {
      // Clear out all the current handlers left over
      ["timeout", "error", "close"].forEach(function(e) {
        server.removeAllListeners(e);
      });

      // Set up new ones
      // Set up listeners
      server.once('timeout',  errorHandler('timeout'));
      server.once('error',  errorHandler('error'));
      server.once('close', errorHandler('close'));
      // Return correctly
      callback(null, self);
    }

    // Set up listeners
    server.once('timeout',  connectErrorHandler('timeout'));
    server.once('error',  connectErrorHandler('error'));
    server.once('close', connectErrorHandler('close'));
    server.once('connect', connectHandler);
    // Start connection
    server.connect();
  }

  // Command
  this.command = function(ns, cmd, options, callback) {
    server.command(ns, cmd, options, callback);
  }

  this.close = function() {
    server.destroy();
  }

  /**
   * All raw connections
   * @method
   * @return {array}
   */
  this.connections = function() {
    return server.connections();
  }    
}

inherits(Server, EventEmitter);

module.exports = Server;