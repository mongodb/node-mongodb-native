var bindToCurrentDomain = require('../connection/utils').bindToCurrentDomain;

// Callbacks instance id
var callbackId = 0;

// Single store for all callbacks
var Callbacks = function() {
  var self = this;
  // Callbacks
  this.callbacks = {};
  // Set the callbacks id
  this.id = callbackId++;
  // Set the type to server
  this.type = 'server';
}

//
// Flush all callbacks
Callbacks.prototype.flush = function(err) {
  for(var id in this.callbacks) {
    if(!isNaN(parseInt(id, 10))) {
      var callback = this.callbacks[id];
      delete this.callbacks[id];
      callback(err, null);
    }
  }
}

//
// Flush all callbacks
Callbacks.prototype.flushConnection = function(err, connection) {
  for(var id in this.callbacks) {
    if(!isNaN(parseInt(id, 10))) {
      var callback = this.callbacks[id];

      // Validate if the operation ran on the connection
      if(callback.connection && callback.connection.id === connection.id) {
        delete this.callbacks[id];
        callback(err, null);
      } else if(!callback.connection && callback.monitoring) {
        delete this.callbacks[id];
        callback(err, null);
      }
    }
  }
}

Callbacks.prototype.callback = function(id) {
  return this.callbacks[id];
}

Callbacks.prototype.emit = function(id, err, value) {
  var callback = this.callbacks[id];
  delete this.callbacks[id];
  callback(err, value);
}

Callbacks.prototype.raw = function(id) {
  if(this.callbacks[id] == null) return false;
  return this.callbacks[id].raw == true ? true : false
}

Callbacks.prototype.documentsReturnedIn = function(id) {
  if(this.callbacks[id] == null) return false;
  return typeof this.callbacks[id].documentsReturnedIn == 'string' ? this.callbacks[id].documentsReturnedIn : null;
}

Callbacks.prototype.unregister = function(id) {
  delete this.callbacks[id];
}

Callbacks.prototype.register = function(id, callback) {
  this.callbacks[id] = bindToCurrentDomain(callback);
}

module.exports = Callbacks;
