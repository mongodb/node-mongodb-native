var SimpleEmitter = exports.SimpleEmitter = function() {}
//
// My own simple synchronous emit support, We don't need the overhead of the built in flexible node.js
// event emitter as we are looking for as low latency as possible.
//
SimpleEmitter.prototype.on = function(event, callback) {
  if(this.eventHandlers[event] == null) throw "Event handler only accepts values of " + Object.keys(this.eventHandlers);
  // Just add callback to our event handler (avoiding the cost of the node.js event handler)
  this.eventHandlers[event].push(callback);
}

SimpleEmitter.prototype.emit = function(event, err, object) {
  if(this.eventHandlers[event] == null) throw "Event handler only accepts values of " + Object.keys(this.eventHandlers);
  // Fire off all the callbacks
  var callbacks = this.eventHandlers[event];
  // Attemp to emit
  try {
    // Perform a callback on all the registered callback handlers
    for(var i = 0; i < callbacks.length; i++) {
      callbacks[i](err, object);
    }    
  } catch (err) {
    this.emit("error", err);
  }
}

SimpleEmitter.prototype.removeListeners = function(event) {
  if(this.eventHandlers[event] == null) throw "Event handler only accepts values of " + Object.keys(this.eventHandlers);
  // Throw away all handlers
  this.eventHandlers[event] = [];
}

SimpleEmitter.prototype.removeAllListeners = function() {
  // Fetch all the keys of handlers
  var keys = Object.keys(this.eventHandlers);  
  // Remove all handlers
  for(var i = 0; i < keys.length; i++) {
    this.eventHandlers[keys[i]] = [];
  }
}
