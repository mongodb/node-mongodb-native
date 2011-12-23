var Buffer = require('buffer').Buffer,
  BSON = require('../bson').BSON,
  Buffer = require('buffer').Buffer,
  BSONJS = require('../../../lib/mongodb/bson/bson').BSON,
  Long = require('../../../lib/mongodb/goog/math/long').Long,
  ObjectID = require('../../../lib/mongodb/bson/bson').ObjectID,
  Binary = require('../../../lib/mongodb/bson/bson').Binary,
  Code = require('../../../lib/mongodb/bson/bson').Code,  
  DBRef = require('../../../lib/mongodb/bson/bson').DBRef,  
  Symbol = require('../../../lib/mongodb/bson/bson').Symbol,  
  Double = require('../../../lib/mongodb/bson/bson').Double,  
  Timestamp = require('../../../lib/mongodb/bson/bson').Timestamp,  
  MinKey = require('../../../lib/mongodb/bson/bson').MinKey,  
  MaxKey = require('../../../lib/mongodb/bson/bson').MaxKey,  
  assert = require('assert');

console.log("=== EXECUTING TEST_SHARED_OBJECTS_BSON ===");

var bsonJS = new BSONJS();
var bsonC = new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey]);

console.dir(bsonC)

// Total count
var COUNT = 100000;

// Basic doc
var doc = {
    doc:'hello', 
    long:Long.fromNumber(100), 
    timestamp:Timestamp.fromNumber(10000),
    minKey:new MinKey(),
    maxKey:new MaxKey(),
    symbol:new Symbol("hello"),
    binary:new Binary(new Buffer('Hello world!!')),
    objectId: ObjectID.createFromHexString("4ef48c19a9af58a399000001"),
    code: new Code("function() {}", {}),
    code_w_scope: new Code("function() {}", {c:1}),
    dbref: new DBRef('collection', new ObjectID(), 'db')
  };
// Serialize using the js driver
var docBin = BSONJS.serialize(doc, false, true);
// Deserialize the doc using the bson
var deserializedDoc = bsonC.deserialize(docBin);

console.log("-------------------------------------------------- deserialize")
console.dir(deserializedDoc)

console.log("-------------------------------------------------- deserialize check")
console.log("isLong = " + (doc.long instanceof Long));
console.log("isTimestamp = " + (doc.timestamp instanceof Timestamp));
console.log("isMinKey = " + (doc.minKey instanceof MinKey));
console.log("isMaxKey = " + (doc.maxKey instanceof MaxKey));
console.log("isSymbol = " + (doc.symbol instanceof Symbol));
console.log("isBinary = " + (doc.binary instanceof Binary));
console.log("isObjectID = " + (doc.objectId instanceof ObjectID));
console.log("isCode = " + (doc.code instanceof Code));
console.log("isCodeWScope = " + (doc.code_w_scope instanceof Code));
console.log("isDBRef = " + (doc.dbref instanceof DBRef));

// Some quick benchmark of using a js object vs a c++ object
var startTime = new Date().getTime();

for(var i = 0; i < COUNT; i++) {
  bsonC.deserialize(docBin);
}

console.log("-------------------- C++ js objects = " + (new Date().getTime() - startTime));

var startTime = new Date().getTime();

for(var i = 0; i < COUNT; i++) {
  BSON.deserialize(docBin);
}

console.log("-------------------- C++ objects = " + (new Date().getTime() - startTime));

var startTime = new Date().getTime();

for(var i = 0; i < COUNT; i++) {
  BSONJS.deserialize(docBin);
}

console.log("-------------------- JS objects = " + (new Date().getTime() - startTime));

