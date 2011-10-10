var debug = require('util').debug,
  inspect = require('util').inspect,
  inherits = require('util').inherits,
  net = require('net'),
  EventEmitter = require("events").EventEmitter;

var COUNT = 1000000;

var Emitter = function() {
}

inherits(Emitter, EventEmitter);

Emitter.prototype.start = function() {
  for(var i = 0; i < COUNT; i++) {
    this.emit("data", "============================================== data")
  }
} 

Emitter.prototype.start2 = function(callback) {
  for(var i = 0; i < COUNT; i++) {
    callback(null, "============================================== data")
  }
}

// Create test object
var emitObj = new Emitter();
emitObj.on("data", function(data) {
})

console.log(COUNT + "x (objectBSON = BSON.serialize(object))")
start = new Date

emitObj.start();

end = new Date
console.log("time = ", end - start, "ms -", COUNT * 1000 / (end - start), " ops/sec")


console.log(COUNT + "x (objectBSON = BSON.serialize(object))")
start = new Date

emitObj.start2(function(err, data) {
  // debug(data)
});

end = new Date
console.log("time = ", end - start, "ms -", COUNT * 1000 / (end - start), " ops/sec")

