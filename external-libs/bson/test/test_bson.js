var sys = require('util'),
  debug = require('util').debug,
  inspect = require('util').inspect,
  Buffer = require('buffer').Buffer,
  BSON = require('../bson').BSON,
  Buffer = require('buffer').Buffer,
  BSONJS = require('../../../lib/mongodb/bson/bson').BSON,
  BinaryParser = require('../../../lib/mongodb/bson/binary_parser').BinaryParser,
  Long = require('../../../lib/mongodb/goog/math/long').Long,
  ObjectID = require('../../../lib/mongodb/bson/bson').ObjectID,
  Binary = require('../../../lib/mongodb/bson/bson').Binary,
  Code = require('../../../lib/mongodb/bson/bson').Code,  
  DBRef = require('../../../lib/mongodb/bson/bson').DBRef,  
  Symbol = require('../../../lib/mongodb/bson/bson').Symbol,  
  Double = require('../../../lib/mongodb/bson/bson').Double,  
  MaxKey = require('../../../lib/mongodb/bson/bson').MaxKey,  
  MinKey = require('../../../lib/mongodb/bson/bson').MinKey,  
  Timestamp = require('../../../lib/mongodb/bson/bson').Timestamp,  
  assert = require('assert');
 
sys.puts("=== EXECUTING TEST_BSON ===");

// Should fail due to illegal key
assert.throws(function() { new ObjectID('foo'); })
assert.throws(function() { new ObjectID('foo'); })

// Parsers
var bsonC = new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey]);
var bsonJS = new BSONJS([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey]);

//
// Assert correct toJSON
//
var a = Long.fromNumber(10);
assert.equal(10, a);

var a = Long.fromNumber(9223372036854775807);
assert.equal(9223372036854775807, a);

// Simple serialization and deserialization test for a Single String value
var doc = {doc:'Serialize'};
var simple_string_serialized = bsonC.serialize(doc, true, false);

assert.deepEqual(simple_string_serialized, bsonJS.serialize(doc, false, true));
assert.deepEqual(bsonJS.deserialize(new Buffer(simple_string_serialized, 'binary')), bsonC.deserialize(simple_string_serialized));

// Nested doc
var doc = {a:{b:{c:1}}};
var simple_string_serialized = bsonC.serialize(doc, false, true);

assert.deepEqual(simple_string_serialized, bsonJS.serialize(doc, false, true));
assert.deepEqual(bsonJS.deserialize(new Buffer(simple_string_serialized, 'binary')), bsonC.deserialize(simple_string_serialized));

// Simple integer serialization/deserialization test, including testing boundary conditions
var doc = {doc:-1};
var simple_string_serialized = bsonC.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, bsonJS.serialize(doc, false, true));
assert.deepEqual(bsonJS.deserialize(new Buffer(simple_string_serialized, 'binary')), bsonC.deserialize(simple_string_serialized));

var doc = {doc:2147483648};
var simple_string_serialized = bsonC.serialize(doc, false, true);
assert.deepEqual(bsonJS.deserialize(new Buffer(simple_string_serialized, 'binary')), bsonC.deserialize(simple_string_serialized));

var doc = {doc:-2147483648};
var simple_string_serialized = bsonC.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, bsonJS.serialize(doc, false, true));
assert.deepEqual(bsonJS.deserialize(new Buffer(simple_string_serialized, 'binary')), bsonC.deserialize(simple_string_serialized));

// Simple serialization and deserialization test for a Long value
var doc = {doc:Long.fromNumber(9223372036854775807)};
var simple_string_serialized = bsonC.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, bsonJS.serialize({doc:Long.fromNumber(9223372036854775807)}, false, true));
assert.deepEqual(bsonJS.deserialize(new Buffer(simple_string_serialized, 'binary')), bsonC.deserialize(simple_string_serialized));

var doc = {doc:Long.fromNumber(-9223372036854775807)};
var simple_string_serialized = bsonC.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, bsonJS.serialize({doc:Long.fromNumber(-9223372036854775807)}, false, true));
assert.deepEqual(bsonJS.deserialize(new Buffer(simple_string_serialized, 'binary')), bsonC.deserialize(simple_string_serialized));

// Simple serialization and deserialization for a Float value
var doc = {doc:2222.3333};
var simple_string_serialized = bsonC.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, bsonJS.serialize(doc, false, true));
assert.deepEqual(bsonJS.deserialize(new Buffer(simple_string_serialized, 'binary')), bsonC.deserialize(simple_string_serialized));

var doc = {doc:-2222.3333};
var simple_string_serialized = bsonC.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, bsonJS.serialize(doc, false, true));
assert.deepEqual(bsonJS.deserialize(new Buffer(simple_string_serialized, 'binary')), bsonC.deserialize(simple_string_serialized));

// Simple serialization and deserialization for a null value
var doc = {doc:null};
var simple_string_serialized = bsonC.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, bsonJS.serialize(doc, false, true));
assert.deepEqual(bsonJS.deserialize(new Buffer(simple_string_serialized, 'binary')), bsonC.deserialize(simple_string_serialized));

// Simple serialization and deserialization for a boolean value
var doc = {doc:true};
var simple_string_serialized = bsonC.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, bsonJS.serialize(doc, false, true));
assert.deepEqual(bsonJS.deserialize(new Buffer(simple_string_serialized, 'binary')), bsonC.deserialize(simple_string_serialized));

// Simple serialization and deserialization for a date value
var date = new Date();
var doc = {doc:date};
var simple_string_serialized = bsonC.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, bsonJS.serialize(doc, false, true));
assert.deepEqual(bsonJS.deserialize(new Buffer(simple_string_serialized, 'binary')), bsonC.deserialize(simple_string_serialized));

// Simple serialization and deserialization for a boolean value
var doc = {doc:/abcd/mi};
var simple_string_serialized = bsonC.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, bsonJS.serialize(doc, false, true));
assert.equal(bsonJS.deserialize(new Buffer(simple_string_serialized, 'binary')).doc.toString(), bsonC.deserialize(simple_string_serialized).doc.toString());

var doc = {doc:/abcd/};
var simple_string_serialized = bsonC.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, bsonJS.serialize(doc, false, true));
assert.equal(bsonJS.deserialize(new Buffer(simple_string_serialized, 'binary')).doc.toString(), bsonC.deserialize(simple_string_serialized).doc.toString());

// Simple serialization and deserialization for a objectId value
var doc = {doc:new ObjectID()};
var simple_string_serialized = bsonC.serialize(doc, false, true);
var doc2 = {doc:ObjectID.createFromHexString(doc.doc.toHexString())};

assert.deepEqual(simple_string_serialized, bsonJS.serialize(doc2, false, true));
assert.deepEqual(bsonJS.deserialize(new Buffer(simple_string_serialized, 'binary')).doc.toString(), bsonC.deserialize(simple_string_serialized).doc.toString());

// Simple serialization and deserialization for a Binary value
var binary = new Binary();
var string = 'binstring'
for(var index = 0; index < string.length; index++) { binary.put(string.charAt(index)); }

var Binary = new Binary();
var string = 'binstring'
for(var index = 0; index < string.length; index++) { Binary.put(string.charAt(index)); }

var simple_string_serialized = bsonC.serialize({doc:binary}, false, true);
assert.deepEqual(simple_string_serialized, bsonJS.serialize({doc:Binary}, false, true));
assert.deepEqual(bsonJS.deserialize(new Buffer(simple_string_serialized, 'binary')).doc.value(), bsonC.deserialize(simple_string_serialized).doc.value());

// Simple serialization and deserialization for a Code value
var code = new Code('this.a > i', {'i': 1});
var Code = new Code('this.a > i', {'i': 1});
var simple_string_serialized_2 = bsonJS.serialize({doc:Code}, false, true);
var simple_string_serialized = bsonC.serialize({doc:code}, false, true);

assert.deepEqual(simple_string_serialized, simple_string_serialized_2);
assert.deepEqual(bsonJS.deserialize(new Buffer(simple_string_serialized_2, 'binary')).doc.scope, bsonC.deserialize(simple_string_serialized).doc.scope);

// Simple serialization and deserialization for an Object
var simple_string_serialized = bsonC.serialize({doc:{a:1, b:{c:2}}}, false, true);
var simple_string_serialized_2 = bsonJS.serialize({doc:{a:1, b:{c:2}}}, false, true);
assert.deepEqual(simple_string_serialized, simple_string_serialized_2)
assert.deepEqual(bsonJS.deserialize(new Buffer(simple_string_serialized_2, 'binary')).doc, bsonC.deserialize(simple_string_serialized).doc);

// Simple serialization and deserialization for an Array
var simple_string_serialized = bsonC.serialize({doc:[9, 9, 1, 2, 3, 1, 1, 1, 1, 1, 1, 1]}, false, true);
var simple_string_serialized_2 = bsonJS.serialize({doc:[9, 9, 1, 2, 3, 1, 1, 1, 1, 1, 1, 1]}, false, true);

assert.deepEqual(simple_string_serialized, simple_string_serialized_2)
assert.deepEqual(bsonJS.deserialize(new Buffer(simple_string_serialized_2, 'binary')).doc, bsonC.deserialize(simple_string_serialized).doc);

// Simple serialization and deserialization for a DBRef
var oid = new ObjectID()
var oid2 = new ObjectID.createFromHexString(oid.toHexString())
var simple_string_serialized = bsonJS.serialize({doc:new DBRef('namespace', oid2, 'integration_tests_')}, false, true);
var simple_string_serialized_2 = bsonC.serialize({doc:new DBRef('namespace', oid, 'integration_tests_')}, false, true);

assert.deepEqual(simple_string_serialized, simple_string_serialized_2)
// Ensure we have the same values for the dbref
var object_js = bsonJS.deserialize(new Buffer(simple_string_serialized_2, 'binary'));
var object_c = bsonC.deserialize(simple_string_serialized);

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
var object = bsonC.deserialize(new Buffer(serialized_data, 'binary'));
assert.equal('Patty', object.name)
assert.equal(34, object.age)
assert.equal('4c640c170b1e270859000001', object._id.toHexString())

// Serialize utf8
var doc = { "name" : "本荘由利地域に洪水警報", "name1" : "öüóőúéáűíÖÜÓŐÚÉÁŰÍ", "name2" : "abcdedede"};
var simple_string_serialized = bsonC.serialize(doc, false, true);
var simple_string_serialized2 = bsonJS.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, simple_string_serialized2)

var object = bsonC.deserialize(simple_string_serialized);
assert.equal(doc.name, object.name)
assert.equal(doc.name1, object.name1)
assert.equal(doc.name2, object.name2)

// Serialize object with array
var doc = {b:[1, 2, 3]};
var simple_string_serialized = bsonC.serialize(doc, false, true);
var simple_string_serialized_2 = bsonJS.serialize(doc, false, true);
assert.deepEqual(simple_string_serialized, simple_string_serialized_2)

var object = bsonC.deserialize(simple_string_serialized);
assert.deepEqual(doc, object)

// Test equality of an object ID
var object_id = new ObjectID();
var object_id_2 = new ObjectID();
assert.ok(object_id.equals(object_id));
assert.ok(!(object_id.equals(object_id_2)))

// Test same serialization for Object ID
var object_id = new ObjectID();
var object_id2 = ObjectID.createFromHexString(object_id.toString())
var simple_string_serialized = bsonJS.serialize({doc:object_id}, false, true);
var simple_string_serialized_2 = bsonC.serialize({doc:object_id2}, false, true);

assert.equal(simple_string_serialized_2.length, simple_string_serialized.length);
assert.deepEqual(simple_string_serialized, simple_string_serialized_2)
var object = bsonJS.deserialize(new Buffer(simple_string_serialized_2, 'binary'));
var object2 = bsonC.deserialize(simple_string_serialized);
assert.equal(object.doc.id, object2.doc.id)

// JS Object
var c1 = { _id: new ObjectID, comments: [], title: 'number 1' };
var c2 = { _id: new ObjectID, comments: [], title: 'number 2' };
var doc = {
    numbers: []
  , owners: []
  , comments: [c1, c2]
  , _id: new ObjectID
};

var simple_string_serialized = bsonJS.serialize(doc, false, true);

// C++ Object
var c1 = { _id: ObjectID.createFromHexString(c1._id.toHexString()), comments: [], title: 'number 1' };
var c2 = { _id: ObjectID.createFromHexString(c2._id.toHexString()), comments: [], title: 'number 2' };
var doc = {
    numbers: []
  , owners: []
  , comments: [c1, c2]
  , _id: ObjectID.createFromHexString(doc._id.toHexString())
};

var simple_string_serialized_2 = bsonC.serialize(doc, false, true);

for(var i = 0; i < simple_string_serialized_2.length; i++) {
  // debug(i + "[" + simple_string_serialized_2[i] + "] = [" + simple_string_serialized[i] + "]")
  assert.equal(simple_string_serialized_2[i], simple_string_serialized[i]);
}

// Deserialize the string
var doc1 = bsonJS.deserialize(new Buffer(simple_string_serialized_2));
var doc2 = bsonC.deserialize(new Buffer(simple_string_serialized_2));
assert.equal(doc._id.id, doc1._id.id)
assert.equal(doc._id.id, doc2._id.id)
assert.equal(doc1._id.id, doc2._id.id)

var doc = {
 _id: 'testid',
  key1: { code: 'test1', time: {start:1309323402727,end:1309323402727}, x:10, y:5 },
  key2: { code: 'test1', time: {start:1309323402727,end:1309323402727}, x:10, y:5 }
};

var simple_string_serialized = bsonJS.serialize(doc, false, true);
var simple_string_serialized_2 = bsonC.serialize(doc, false, true);

// Deserialize the string
var doc1 = bsonJS.deserialize(new Buffer(simple_string_serialized_2));
var doc2 = bsonC.deserialize(new Buffer(simple_string_serialized_2));
assert.deepEqual(doc2, doc1)
assert.deepEqual(doc, doc2)
assert.deepEqual(doc, doc1)

// Serialize function
var doc = {
 _id: 'testid',
  key1: function() {}
}

var simple_string_serialized = bsonJS.serialize(doc, false, true, true);
var simple_string_serialized_2 = bsonC.serialize(doc, false, true, true);

// Deserialize the string
var doc1 = bsonJS.deserialize(new Buffer(simple_string_serialized_2));
var doc2 = bsonC.deserialize(new Buffer(simple_string_serialized_2));
assert.equal(doc1.key1.code.toString(), doc2.key1.code.toString())

var doc =  {"user_id":"4e9fc8d55883d90100000003","lc_status":{"$ne":"deleted"},"owner_rating":{"$exists":false}};
var simple_string_serialized = bsonJS.serialize(doc, false, true, true);
var simple_string_serialized_2 = bsonC.serialize(doc, false, true, true);

// Should serialize to the same value
assert.equal(simple_string_serialized_2.toString('hex'), simple_string_serialized.toString('hex'))
var doc1 = bsonJS.deserialize(simple_string_serialized_2);
var doc2 = bsonC.deserialize(simple_string_serialized);
assert.deepEqual(doc1, doc2)

// Hex Id
var hexId = new ObjectID().toString();
var docJS = {_id: ObjectID.createFromHexString(hexId), 'funds.remaining': {$gte: 1.222}, 'transactions.id': {$ne: ObjectID.createFromHexString(hexId)}};
var docC = {_id: ObjectID.createFromHexString(hexId), 'funds.remaining': {$gte: 1.222}, 'transactions.id': {$ne: ObjectID.createFromHexString(hexId)}};
var docJSBin = bsonJS.serialize(docJS, false, true, true);
var docCBin = bsonC.serialize(docC, false, true, true);
assert.equal(docCBin.toString('hex'), docJSBin.toString('hex'));

// // Complex document serialization
// doc = {"DateTime": "Tue Nov 40 2011 17:27:55 GMT+0000 (WEST)","isActive": true,"Media": {"URL": "http://videos.sapo.pt/Tc85NsjaKjj8o5aV7Ubb"},"Title": "Lisboa fecha a ganhar 0.19%","SetPosition": 60,"Type": "videos","Thumbnail": [{"URL": "http://rd3.videos.sapo.pt/Tc85NsjaKjj8o5aV7Ubb/pic/320x240","Dimensions": {"Height": 240,"Width": 320}}],"Source": {"URL": "http://videos.sapo.pt","SetID": "1288","SourceID": "http://videos.sapo.pt/tvnet/rss2","SetURL": "http://noticias.sapo.pt/videos/tv-net_1288/","ItemID": "Tc85NsjaKjj8o5aV7Ubb","Name": "SAPO VÃ­deos"},"Category": "Tec_ciencia","Description": "Lisboa fecha a ganhar 0.19%","GalleryID": new ObjectID("4eea2a634ce8573200000000"),"InternalRefs": {"RegisterDate": "Thu Dec 15 2011 17:12:51 GMT+0000 (WEST)","ChangeDate": "Thu Dec 15 2011 17:12:51 GMT+0000 (WEST)","Hash": 332279244514},"_id": new ObjectID("4eea2a96e52778160000003a")}
// var docJSBin = bsonJS.serialize(docJS, false, true, true);
// var docCBin = bsonC.serialize(docC, false, true, true);
// 
// 

// // Force garbage collect
// global.gc();















