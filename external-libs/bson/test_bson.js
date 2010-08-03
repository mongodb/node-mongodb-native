require.paths.unshift("../../lib");

var sys = require('sys'),
  BSON = require('./bson').BSON,
  Buffer = require('buffer').Buffer,
  BSONJS = require('mongodb/bson/bson').BSON,
  Long = require('mongodb/goog/math/long').Long,
  assert = require('assert');
  
var Long2 = require('./bson').Long;

// Long data type tests
var l2_string = Long2.fromNumber(9223372036854775807).toString();
var l_string = Long.fromNumber(9223372036854775807).toString();
sys.debug("===================== Long JS: [" + l_string + "] = " + l_string.length);
sys.debug("===================== Long C: [" + l2_string + "] = " + l2_string.length);
sys.debug(l_string == l2_string);
assert.equal(l_string, l2_string);

l2_string = Long2.fromNumber(9223372036800).toString();
l_string = Long.fromNumber(9223372036800).toString();
sys.debug("===================== Long JS: [" + l_string + "] = " + l_string.length);
sys.debug("===================== Long C: [" + l2_string + "] = " + l2_string.length);
sys.debug(l_string == l2_string);

l2_string = Long2.fromNumber(2355).toString();
l_string = Long.fromNumber(2355).toString();
sys.debug("===================== Long JS: [" + l_string + "] = " + l_string.length);
sys.debug("===================== Long C: [" + l2_string + "] = " + l2_string.length);
sys.debug(l_string == l2_string);

l_string = Long.fromNumber(-9223372036854775807).toString();
l2_string = Long2.fromNumber(-9223372036854775807).toString();
sys.debug("===================== Long JS: [" + l_string + "] = " + l_string.length);
sys.debug("===================== Long C: [" + l2_string + "] = " + l2_string.length);
sys.debug(l_string == l2_string);

l2_string = Long2.fromNumber(-2355).toString();
l_string = Long.fromNumber(-2355).toString();
sys.debug("===================== Long JS: [" + l_string + "] = " + l_string.length);
sys.debug("===================== Long C: [" + l2_string + "] = " + l2_string.length);
sys.debug(l_string == l2_string);


// sys.puts(sys.inspect(require('./bson')))
// var l = new Long2();
// sys.puts("=============== Long:ToString() = " + l.toString());

// sys.puts(sys.inspect(require.paths))
var bson = new BSON();
var data = new Buffer("Hello world!")

// // Simple serialization and deserialization test for a Single String value
// var simple_string_serialized = BSONJS.serialize({doc:'Serialize'});
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(new Buffer(simple_string_serialized, 'binary')));
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(simple_string_serialized, 'binary'));
// 
// // Simple integer serialization/deserialization test, including testing boundary conditions
// var simple_string_serialized = BSONJS.serialize({doc:-1});
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(new Buffer(simple_string_serialized, 'binary')));
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(simple_string_serialized, 'binary'));
// 
// var simple_string_serialized = BSONJS.serialize({doc:2147483648});
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(new Buffer(simple_string_serialized, 'binary')));
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(simple_string_serialized, 'binary'));
// 
// var simple_string_serialized = BSONJS.serialize({doc:-2147483648});
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(new Buffer(simple_string_serialized, 'binary')));
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(simple_string_serialized, 'binary'));

// Simple serialization and deserialization test for a Long value
// var simple_string_serialized = BSONJS.serialize({doc:Long2.fromNumber(9223372036854775807)});
// sys.puts(sys.inspect(bson.deserialize(simple_string_serialized, 'binary')))
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(new Buffer(simple_string_serialized, 'binary')));
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(simple_string_serialized, 'binary'));
