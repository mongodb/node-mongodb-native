var sys = require('util'),
  debug = require('util').debug,
  inspect = require('util').inspect,
  Buffer = require('buffer').Buffer,
  BSON = require('./bson').BSON,
  Buffer = require('buffer').Buffer,
  BSONJS = require('../../lib/mongodb/bson/bson').BSON,
  BinaryParser = require('../../lib/mongodb/bson/binary_parser').BinaryParser,
  Long = require('../../lib/mongodb/goog/math/long').Long,
  ObjectID = require('../../lib/mongodb/bson/bson').ObjectID,
  Binary = require('../../lib/mongodb/bson/bson').Binary,
  Code = require('../../lib/mongodb/bson/bson').Code,  
  DBRef = require('../../lib/mongodb/bson/bson').DBRef,  
  assert = require('assert');
  
var Long2 = require('./bson').Long,
    ObjectID2 = require('./bson').ObjectID,
    Binary2 = require('./bson').Binary,
    Code2 = require('./bson').Code,
    DBRef2 = require('./bson').DBRef;
    
sys.puts("=== EXECUTING TEST_BSON ===");

// Should fail due to illegal key
assert.throws(function() { new ObjectID('foo'); })
assert.throws(function() { new ObjectID2('foo'); })

// Long data type tests
var l2_string = Long2.fromNumber(100);
var l_string = Long.fromNumber(100);
assert.equal(l_string.toNumber(), l2_string.toNumber());

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

var a = Long2.fromNumber(10);
assert.equal(10, a);

var a = Long2.fromNumber(9223372036854775807);
assert.equal(9223372036854775807, a);

// Simple serialization and deserialization test for a Single String value
var doc = {doc:'Serialize'};
var simple_string_serialized = BSON.serialize(doc, true, false);

assert.deepEqual(simple_string_serialized, BSONJS.serialize(doc, false, true));
assert.deepEqual(BSONJS.deserialize(new Buffer(simple_string_serialized, 'binary')), BSON.deserialize(simple_string_serialized));

// Nested doc
var doc = {a:{b:{c:1}}};
var simple_string_serialized = BSON.serialize(doc, false, true);

assert.deepEqual(simple_string_serialized, BSONJS.serialize(doc, false, true));
assert.deepEqual(BSONJS.deserialize(new Buffer(simple_string_serialized, 'binary')), BSON.deserialize(simple_string_serialized));

// Simple integer serialization/deserialization test, including testing boundary conditions
var doc = {doc:-1};
var simple_string_serialized = BSON.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, BSONJS.serialize(doc, false, true));
assert.deepEqual(BSONJS.deserialize(new Buffer(simple_string_serialized, 'binary')), BSON.deserialize(simple_string_serialized));

var doc = {doc:2147483648};
var simple_string_serialized = BSON.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, BSONJS.serialize(doc, false, true));
assert.deepEqual(BSONJS.deserialize(new Buffer(simple_string_serialized, 'binary')), BSON.deserialize(simple_string_serialized));

var doc = {doc:-2147483648};
var simple_string_serialized = BSON.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, BSONJS.serialize(doc, false, true));
assert.deepEqual(BSONJS.deserialize(new Buffer(simple_string_serialized, 'binary')), BSON.deserialize(simple_string_serialized));

// Simple serialization and deserialization test for a Long value
var doc = {doc:Long2.fromNumber(9223372036854775807)};
var simple_string_serialized = BSON.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, BSONJS.serialize({doc:Long.fromNumber(9223372036854775807)}, false, true));
assert.deepEqual(BSONJS.deserialize(new Buffer(simple_string_serialized, 'binary')), BSON.deserialize(simple_string_serialized));

var doc = {doc:Long2.fromNumber(-9223372036854775807)};
var simple_string_serialized = BSON.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, BSONJS.serialize({doc:Long.fromNumber(-9223372036854775807)}, false, true));
assert.deepEqual(BSONJS.deserialize(new Buffer(simple_string_serialized, 'binary')), BSON.deserialize(simple_string_serialized));

// Simple serialization and deserialization for a Float value
var doc = {doc:2222.3333};
var simple_string_serialized = BSON.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, BSONJS.serialize(doc, false, true));
assert.deepEqual(BSONJS.deserialize(new Buffer(simple_string_serialized, 'binary')), BSON.deserialize(simple_string_serialized));

var doc = {doc:-2222.3333};
var simple_string_serialized = BSON.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, BSONJS.serialize(doc, false, true));
assert.deepEqual(BSONJS.deserialize(new Buffer(simple_string_serialized, 'binary')), BSON.deserialize(simple_string_serialized));

// Simple serialization and deserialization for a null value
var doc = {doc:null};
var simple_string_serialized = BSON.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, BSONJS.serialize(doc, false, true));
assert.deepEqual(BSONJS.deserialize(new Buffer(simple_string_serialized, 'binary')), BSON.deserialize(simple_string_serialized));

// Simple serialization and deserialization for a boolean value
var doc = {doc:true};
var simple_string_serialized = BSON.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, BSONJS.serialize(doc, false, true));
assert.deepEqual(BSONJS.deserialize(new Buffer(simple_string_serialized, 'binary')), BSON.deserialize(simple_string_serialized));

// Simple serialization and deserialization for a date value
var date = new Date();
var doc = {doc:date};
var simple_string_serialized = BSON.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, BSONJS.serialize(doc, false, true));
assert.deepEqual(BSONJS.deserialize(new Buffer(simple_string_serialized, 'binary')), BSON.deserialize(simple_string_serialized));

// Simple serialization and deserialization for a boolean value
var doc = {doc:/abcd/mi};
var simple_string_serialized = BSON.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, BSONJS.serialize(doc, false, true));
assert.equal(BSONJS.deserialize(new Buffer(simple_string_serialized, 'binary')).doc.toString(), BSON.deserialize(simple_string_serialized).doc.toString());

var doc = {doc:/abcd/};
var simple_string_serialized = BSON.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, BSONJS.serialize(doc, false, true));
assert.equal(BSONJS.deserialize(new Buffer(simple_string_serialized, 'binary')).doc.toString(), BSON.deserialize(simple_string_serialized).doc.toString());

// Simple serialization and deserialization for a objectId value
var doc = {doc:new ObjectID2()};
var simple_string_serialized = BSON.serialize(doc, false, true);
var doc2 = {doc:ObjectID.createFromHexString(doc.doc.toHexString())};

assert.deepEqual(simple_string_serialized, BSONJS.serialize(doc2, false, true));
assert.deepEqual(BSONJS.deserialize(new Buffer(simple_string_serialized, 'binary')).doc.toString(), BSON.deserialize(simple_string_serialized).doc.toString());

// Simple serialization and deserialization for a Binary value
var binary = new Binary2();
var string = 'binstring'
for(var index = 0; index < string.length; index++) { binary.put(string.charAt(index)); }

var binary2 = new Binary();
var string = 'binstring'
for(var index = 0; index < string.length; index++) { binary2.put(string.charAt(index)); }

var simple_string_serialized = BSON.serialize({doc:binary}, false, true);
assert.deepEqual(simple_string_serialized, BSONJS.serialize({doc:binary2}, false, true));
assert.deepEqual(BSONJS.deserialize(new Buffer(simple_string_serialized, 'binary')).doc.value(), BSON.deserialize(simple_string_serialized).doc.value());

// Simple serialization and deserialization for a Code value
var code = new Code2('this.a > i', {'i': 1});
var code2 = new Code('this.a > i', {'i': 1});
var simple_string_serialized_2 = BSONJS.serialize({doc:code2}, false, true);
var simple_string_serialized = BSON.serialize({doc:code}, false, true);

assert.deepEqual(simple_string_serialized, simple_string_serialized_2);
assert.deepEqual(BSONJS.deserialize(new Buffer(simple_string_serialized_2, 'binary')).doc.scope, BSON.deserialize(simple_string_serialized).doc.scope);

// Simple serialization and deserialization for an Object
var simple_string_serialized = BSON.serialize({doc:{a:1, b:{c:2}}}, false, true);
var simple_string_serialized_2 = BSONJS.serialize({doc:{a:1, b:{c:2}}}, false, true);
assert.deepEqual(simple_string_serialized, simple_string_serialized_2)
assert.deepEqual(BSONJS.deserialize(new Buffer(simple_string_serialized_2, 'binary')).doc, BSON.deserialize(simple_string_serialized).doc);

// Simple serialization and deserialization for an Array
var simple_string_serialized = BSON.serialize({doc:[9, 9, 1, 2, 3, 1, 1, 1, 1, 1, 1, 1]}, false, true);
var simple_string_serialized_2 = BSONJS.serialize({doc:[9, 9, 1, 2, 3, 1, 1, 1, 1, 1, 1, 1]}, false, true);

assert.deepEqual(simple_string_serialized, simple_string_serialized_2)
assert.deepEqual(BSONJS.deserialize(new Buffer(simple_string_serialized_2, 'binary')).doc, BSON.deserialize(simple_string_serialized).doc);

// Simple serialization and deserialization for a DBRef
var oid = new ObjectID2()
var oid2 = new ObjectID.createFromHexString(oid.toHexString())
var simple_string_serialized = BSONJS.serialize({doc:new DBRef('namespace', oid2, 'integration_tests_')}, false, true);
var simple_string_serialized_2 = BSON.serialize({doc:new DBRef2('namespace', oid, 'integration_tests_')}, false, true);

assert.deepEqual(simple_string_serialized, simple_string_serialized_2)
// Ensure we have the same values for the dbref
var object_js = BSONJS.deserialize(new Buffer(simple_string_serialized_2, 'binary'));
var object_c = BSON.deserialize(simple_string_serialized);

assert.equal(object_js.doc.namespace, object_c.doc.namespace);
assert.equal(object_js.doc.oid.toHexString(), object_c.doc.oid.toHexString());
assert.equal(object_js.doc.db, object_c.doc.db);

// Serialized document
var bytes = [47,0,0,0,2,110,97,109,101,0,6,0,0,0,80,97,116,116,121,0,16,97,103,101,0,34,0,0,0,7,95,105,100,0,76,100,12,23,11,30,39,8,89,0,0,1,0];
var serialized_data = '';
// Convert to chars
for(var i = 0; i < bytes.length; i++) {
  serialized_data = serialized_data + BinaryParser.fromByte(bytes[i]);
}
var object = BSON.deserialize(new Buffer(serialized_data, 'binary'));
assert.equal('Patty', object.name)
assert.equal(34, object.age)
assert.equal('4c640c170b1e270859000001', object._id.toHexString())

// Serialize utf8
var doc = { "name" : "本荘由利地域に洪水警報", "name1" : "öüóőúéáűíÖÜÓŐÚÉÁŰÍ", "name2" : "abcdedede"};
var simple_string_serialized = BSON.serialize(doc, false, true);
var simple_string_serialized2 = BSONJS.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, simple_string_serialized2)

var object = BSON.deserialize(simple_string_serialized);
assert.equal(doc.name, object.name)
assert.equal(doc.name1, object.name1)
assert.equal(doc.name2, object.name2)

// Serialize object with array
var doc = {b:[1, 2, 3]};
var simple_string_serialized = BSON.serialize(doc, false, true);
var simple_string_serialized_2 = BSONJS.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, simple_string_serialized_2)

var object = BSON.deserialize(simple_string_serialized);
assert.deepEqual(doc, object)

// Test equality of an object ID
var object_id = new ObjectID2();
var object_id_2 = new ObjectID2();
assert.ok(object_id.equals(object_id));
assert.ok(!(object_id.equals(object_id_2)))

// Test same serialization for Object ID
var object_id = new ObjectID();
var object_id2 = ObjectID2.createFromHexString(object_id.toString())
var simple_string_serialized = BSONJS.serialize({doc:object_id}, false, true);
var simple_string_serialized_2 = BSON.serialize({doc:object_id2}, false, true);

assert.equal(simple_string_serialized_2.length, simple_string_serialized.length);
assert.deepEqual(simple_string_serialized, simple_string_serialized_2)
var object = BSONJS.deserialize(new Buffer(simple_string_serialized_2, 'binary'));
var object2 = BSON.deserialize(simple_string_serialized);
assert.deepEqual(object, object2);

// JS Object
var c1 = { _id: new ObjectID, comments: [], title: 'number 1' };
var c2 = { _id: new ObjectID, comments: [], title: 'number 2' };
var doc = {
    numbers: []
  , owners: []
  , comments: [c1, c2]
  , _id: new ObjectID
};

var simple_string_serialized = BSONJS.serialize(doc, false, true);

// C++ Object
var c1 = { _id: ObjectID2.createFromHexString(c1._id.toHexString()), comments: [], title: 'number 1' };
var c2 = { _id: ObjectID2.createFromHexString(c2._id.toHexString()), comments: [], title: 'number 2' };
var doc = {
    numbers: []
  , owners: []
  , comments: [c1, c2]
  , _id: ObjectID2.createFromHexString(doc._id.toHexString())
};

var simple_string_serialized_2 = BSON.serialize(doc, false, true);

for(var i = 0; i < simple_string_serialized_2.length; i++) {
  // debug(i + "[" + simple_string_serialized_2[i] + "] = [" + simple_string_serialized[i] + "]")
  assert.equal(simple_string_serialized_2[i], simple_string_serialized[i]);
}

// Deserialize the string
var doc1 = BSONJS.deserialize(new Buffer(simple_string_serialized_2));
var doc2 = BSON.deserialize(new Buffer(simple_string_serialized_2));
assert.deepEqual(doc2, doc1)

var doc = {
 _id: 'testid',
  key1: { code: 'test1', time: {start:1309323402727,end:1309323402727}, x:10, y:5 },
  key2: { code: 'test1', time: {start:1309323402727,end:1309323402727}, x:10, y:5 }
};

var simple_string_serialized = BSONJS.serialize(doc, false, true);
var simple_string_serialized_2 = BSON.serialize(doc, false, true);

for(var i = 0; i < simple_string_serialized_2.length; i++) {
  // debug(i + "[" + simple_string_serialized_2[i] + "] = [" + simple_string_serialized[i] + "]")
  assert.equal(simple_string_serialized_2[i], simple_string_serialized[i]);
}

// Deserialize the string
var doc1 = BSONJS.deserialize(new Buffer(simple_string_serialized_2));
var doc2 = BSON.deserialize(new Buffer(simple_string_serialized_2));
assert.deepEqual(doc2, doc1)

// Force garbage collect
global.gc();















