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

var Long2 = require('../bson').Long,
    ObjectID2 = require('../bson').ObjectID,
    Binary2 = require('../bson').Binary,
    Code2 = require('../bson').Code,
    Symbol2 = require('../bson').Symbol,
    Double2 = require('../bson').Double,
    MinKey2 = require('../bson').MinKey,
    MaxKey2 = require('../bson').MaxKey,
    Timestamp2 = require('../bson').Timestamp,
    DBRef2 = require('../bson').DBRef;

console.log("=== EXECUTING TEST_SHARED_OBJECTS_BSON ===");

var bsonJS = new BSONJS();
var bsonC = new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey]);

console.dir(bsonC)

// Total count
var COUNT = 10000;

// Basic doc
var doc = {
    doc:'hello', 
    long:Long.fromNumber(100), 
    timestamp:Timestamp.fromNumber(10000),
    minKey:new MinKey(),
    maxKey:new MaxKey(),
    // // symbol:new Symbol("hello"),
    binary:new Binary(new Buffer('Hello world')),
    objectId: ObjectID.createFromHexString("4ef48c19a9af58a399000001"),
    double: new Double(32.33),
    // code: new Code("function() {}", {}),
    // code_w_scope: new Code("function() {}", {c:1}),
    // dbref: new DBRef('collection', new ObjectID(), 'db'),
    object: {
      a: 1,
      b: 'hello',
      c: {
        long:Long.fromNumber(100)
      }
    }
  };

var doc2 = {
    doc:'hello', 
    long:Long2.fromNumber(100), 
    timestamp:Timestamp2.fromNumber(10000),
    minKey:new MinKey2(),
    maxKey:new MaxKey2(),
    // symbol:new Symbol2("hello"),
    binary:new Binary2(new Buffer('Hello world')),
    objectId: ObjectID2.createFromHexString("4ef48c19a9af58a399000001"),
    double: new Double2(32.33),
    // code: new Code2("function() {}", {}),
    // code_w_scope: new Code2("function() {}", {c:1}),
    // dbref: new DBRef2('collection', new ObjectID2(), 'db'),
    object: {
      a: 1,
      b: 'hello',
      c: {
        long:Long2.fromNumber(100)
      }
    }
  };
  
// // Serialize using the js driver
// var docBin = BSONJS.serialize(doc, false, true);

// Serialize using the c++ driver
var doc2Bin = bsonC.serialize(doc, false, true);

var r = bsonC.deserialize(doc2Bin);
console.dir(r);
// console.log(r.binary.value())

// // --------------------------------------------------------------------------------------
// // --------------------------------------------------------------------------------------
// // Serialize performance
// // --------------------------------------------------------------------------------------
// // --------------------------------------------------------------------------------------
// console.log("----------------------------------------------------- serialize");
// // Some quick benchmark of using a js object vs a c++ object
// var startTime = new Date().getTime();
// 
// for(var i = 0; i < COUNT; i++) {
//   bsonC.serialize(doc, false, true);
// }
// 
// console.log("serialize :: -------------------- C++ js objects = " + (new Date().getTime() - startTime));
// 
// var startTime = new Date().getTime();
// 
// for(var i = 0; i < COUNT; i++) {
//   BSON.serialize(doc2, false, true);
// }
// 
// console.log("serialize :: -------------------- C++ objects = " + (new Date().getTime() - startTime));
// 
// var startTime = new Date().getTime();
// 
// for(var i = 0; i < COUNT; i++) {
//   BSONJS.serialize(doc, false, true);
// }
// 
// console.log("serialize :: -------------------- JS objects = " + (new Date().getTime() - startTime));








// // Calculate sizes
// var c_js_size = bsonC.calculateObjectSize(doc);
// var js_size = BSONJS.calculateObjectSize(doc);
// 
// console.log("----------------------------------------------------- calculateSize");
// console.log("c_js = " + c_js_size);
// console.log("js = " + js_size);
// 
// // Some quick benchmark of using a js object vs a c++ object
// var startTime = new Date().getTime();
// 
// for(var i = 0; i < COUNT; i++) {
//   bsonC.calculateObjectSize(doc);
// }
// 
// console.log("calculateObjectSize :: -------------------- C++ js objects = " + (new Date().getTime() - startTime));
// 
// var startTime = new Date().getTime();
// 
// for(var i = 0; i < COUNT; i++) {
//   BSON.calculateObjectSize(doc2);
// }
// 
// console.log("calculateObjectSize :: -------------------- C++ objects = " + (new Date().getTime() - startTime));
// 
// var startTime = new Date().getTime();
// 
// for(var i = 0; i < COUNT; i++) {
//   BSONJS.calculateObjectSize(doc);
// }
// 
// console.log("calculateObjectSize :: -------------------- JS objects = " + (new Date().getTime() - startTime));
// 
// 
// // Deserialize the doc using the bson
// var deserializedDoc = bsonC.deserialize(docBin);
// 
// console.log("-------------------------------------------------- deserialize")
// console.dir(deserializedDoc)
// 
// console.log("-------------------------------------------------- deserialize check")
// console.log("isLong = " + (doc.long instanceof Long));
// console.log("isTimestamp = " + (doc.timestamp instanceof Timestamp));
// console.log("isMinKey = " + (doc.minKey instanceof MinKey));
// console.log("isMaxKey = " + (doc.maxKey instanceof MaxKey));
// console.log("isSymbol = " + (doc.symbol instanceof Symbol));
// console.log("isBinary = " + (doc.binary instanceof Binary));
// console.log("isObjectID = " + (doc.objectId instanceof ObjectID));
// console.log("isCode = " + (doc.code instanceof Code));
// console.log("isCodeWScope = " + (doc.code_w_scope instanceof Code));
// console.log("isDBRef = " + (doc.dbref instanceof DBRef));
// 
// // Some quick benchmark of using a js object vs a c++ object
// var startTime = new Date().getTime();
// 
// for(var i = 0; i < COUNT; i++) {
//   bsonC.deserialize(docBin);
// }
// 
// console.log("-------------------- C++ js objects = " + (new Date().getTime() - startTime));
// 
// var startTime = new Date().getTime();
// 
// for(var i = 0; i < COUNT; i++) {
//   BSON.deserialize(docBin);
// }
// 
// console.log("-------------------- C++ objects = " + (new Date().getTime() - startTime));
// 
// var startTime = new Date().getTime();
// 
// for(var i = 0; i < COUNT; i++) {
//   BSONJS.deserialize(docBin);
// }
// 
// console.log("-------------------- JS objects = " + (new Date().getTime() - startTime));

