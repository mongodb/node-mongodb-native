require.paths.unshift("../../lib");

var sys = require('sys'),
  BSON = require('./bson').BSON,
  Buffer = require('buffer').Buffer,
  BSONJS = require('mongodb/bson/bson').BSON,
  Long = require('mongodb/goog/math/long').Long,
  assert = require('assert');
  
var Long2 = require('./bson').Long;

// sys.puts(sys.inspect(require('./bson')))
var l = new Long2();
sys.puts("=============== Long:ToString() = " + l.toString());

// sys.puts(sys.inspect(require.paths))
var bson = new BSON();
var data = new Buffer("Hello world!")

// Simple serialization and deserialization test for a Single String value
var simple_string_serialized = BSONJS.serialize({doc:'Serialize'});
assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(new Buffer(simple_string_serialized, 'binary')));
assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(simple_string_serialized, 'binary'));

// Simple integer serialization/deserialization test, including testing boundary conditions
var simple_string_serialized = BSONJS.serialize({doc:-1});
assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(new Buffer(simple_string_serialized, 'binary')));
assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(simple_string_serialized, 'binary'));

var simple_string_serialized = BSONJS.serialize({doc:2147483648});
assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(new Buffer(simple_string_serialized, 'binary')));
assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(simple_string_serialized, 'binary'));

var simple_string_serialized = BSONJS.serialize({doc:-2147483648});
assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(new Buffer(simple_string_serialized, 'binary')));
assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(simple_string_serialized, 'binary'));

// Simple serialization and deserialization test for a Long value
// var simple_string_serialized = BSONJS.serialize({doc:Long.fromNumber(9223372036854775807)});
// sys.puts(sys.inspect(bson.deserialize(simple_string_serialized, 'binary')))
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(new Buffer(simple_string_serialized, 'binary')));
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(simple_string_serialized, 'binary'));
