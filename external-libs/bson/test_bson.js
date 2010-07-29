require.paths.unshift("../../lib");

var sys = require('sys'),
  BSON = require('./bson').BSON,
  Buffer = require('buffer').Buffer,
  BSONJS = require('mongodb/bson/bson').BSON,
  assert = require('assert');

// sys.puts(sys.inspect(require.paths))

var bson = new BSON();
var data = new Buffer("Hello world!")

// Simple serialization and deserialization
var simple_string_serialized = BSONJS.serialize({doc:'Serialize'});
assert.equal("Serialize", BSONJS.deserialize(simple_string_serialized).doc);
assert.equal("Serialize", bson.deserialize(new Buffer(simple_string_serialized)));

// sys.puts("================= running test: " + bson.deserialize(data));
// sys.puts("================= running test: " + bson.deserialize());