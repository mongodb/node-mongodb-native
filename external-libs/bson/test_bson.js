require.paths.unshift("../../lib");

var sys = require('sys'),
  Buffer = require('buffer').Buffer,
  BSON = require('./bson').BSON,
  Buffer = require('buffer').Buffer,
  BSONJS = require('mongodb/bson/bson').BSON,
  Long = require('mongodb/goog/math/long').Long,
  ObjectID = require('mongodb/bson/bson').ObjectID,
  Binary = require('mongodb/bson/bson').Binary,
  Code = require('mongodb/bson/bson').Code,  
  assert = require('assert');
  
var Long2 = require('./bson').Long,
    ObjectID2 = require('./bson').ObjectID,
    Binary2 = require('./bson').Binary2,
    Code2 = require('./bson').Code2;

// Long data type tests
var l2_string = Long2.fromNumber(9223372036854775807).toString();
var l_string = Long.fromNumber(9223372036854775807).toString();
assert.equal(l_string, l2_string);

l2_string = Long2.fromNumber(9223372036800).toString();
l_string = Long.fromNumber(9223372036800).toString();
assert.equal(l_string, l2_string);

l2_string = Long2.fromNumber(2355).toString();
l_string = Long.fromNumber(2355).toString();
assert.equal(l_string, l2_string);

l_string = Long.fromNumber(-9223372036854775807).toString();
l2_string = Long2.fromNumber(-9223372036854775807).toString();
assert.equal(l_string, l2_string);

l2_string = Long2.fromNumber(-2355).toString();
l_string = Long.fromNumber(-2355).toString();
assert.equal(l_string, l2_string);

l2_string = Long2.fromNumber(-1).toString();
l_string = Long.fromNumber(-1).toString();
assert.equal(l_string, l2_string);

l2_string = Long2.fromNumber(1).toString();
l_string = Long.fromNumber(1).toString();
assert.equal(l_string, l2_string);

// Create an instance of the bson object
var bson = new BSON();

// Simple serialization and deserialization test for a Single String value
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
// 
// // Simple serialization and deserialization test for a Long value
// var simple_string_serialized = BSONJS.serialize({doc:Long2.fromNumber(9223372036854775807)});
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(new Buffer(simple_string_serialized, 'binary')));
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(simple_string_serialized, 'binary'));
// 
// // Simple serialization and deserialization for a Float value
// var simple_string_serialized = BSONJS.serialize({doc:2222.3333});
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(new Buffer(simple_string_serialized, 'binary')));
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(simple_string_serialized, 'binary'));
// 
// var simple_string_serialized = BSONJS.serialize({doc:-2222.3333});
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(new Buffer(simple_string_serialized, 'binary')));
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(simple_string_serialized, 'binary'));
// 
// // Simple serialization and deserialization for a null value
// var simple_string_serialized = BSONJS.serialize({doc:null});
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(new Buffer(simple_string_serialized, 'binary')));
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(simple_string_serialized, 'binary'));
// 
// // Simple serialization and deserialization for a boolean value
// var simple_string_serialized = BSONJS.serialize({doc:true});
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(new Buffer(simple_string_serialized, 'binary')));
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(simple_string_serialized, 'binary'));
// 
// // Simple serialization and deserialization for a date value
// var date = new Date();
// var simple_string_serialized = BSONJS.serialize({doc:date});
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(new Buffer(simple_string_serialized, 'binary')));
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized), bson.deserialize(simple_string_serialized, 'binary'));
// 
// // Simple serialization and deserialization for a boolean value
// var simple_string_serialized = BSONJS.serialize({doc:/abcd/mi});
// assert.equal(BSONJS.deserialize(simple_string_serialized).doc.toString(), bson.deserialize(simple_string_serialized, 'binary').doc.toString());
// assert.equal(BSONJS.deserialize(simple_string_serialized).doc.toString(), bson.deserialize(new Buffer(simple_string_serialized, 'binary')).doc.toString());
// 
// // Simple serialization and deserialization for a objectId value
// var simple_string_serialized = BSONJS.serialize({doc:new ObjectID()});
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized).doc.toString(), bson.deserialize(new Buffer(simple_string_serialized, 'binary')).doc.toString());
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized).doc.toString(), bson.deserialize(simple_string_serialized, 'binary').doc.toString());
// 
// // Simple serialization and deserialization for a Binary value
// var binary = new Binary();
// var string = 'binstring'
// for(var index = 0; index < string.length; index++) { binary.put(string.charAt(index)); }
// var simple_string_serialized = BSONJS.serialize({doc:binary});
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized).doc.value(), bson.deserialize(new Buffer(simple_string_serialized, 'binary')).doc.value());
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized).doc.value(), bson.deserialize(simple_string_serialized, 'binary').doc.value());
// 
// // Simple serialization and deserialization for a Binary value
// var code = new Code('this.a > i', {'i': 1});
// var simple_string_serialized = BSONJS.serialize({doc:code});
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized).doc.scope, bson.deserialize(new Buffer(simple_string_serialized, 'binary')).doc.scope);
// assert.deepEqual(BSONJS.deserialize(simple_string_serialized).doc.code, bson.deserialize(simple_string_serialized, 'binary').doc.code);

// Simple serialization and deserialization for an Object
var simple_string_serialized = BSONJS.serialize({doc:{a:1}});
sys.puts(sys.inspect(bson.deserialize(new Buffer(simple_string_serialized, 'binary'))))
assert.deepEqual(BSONJS.deserialize(simple_string_serialized).doc, bson.deserialize(new Buffer(simple_string_serialized, 'binary')).doc);
assert.deepEqual(BSONJS.deserialize(simple_string_serialized).doc, bson.deserialize(simple_string_serialized, 'binary').doc);






















