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

// Total count
var COUNT = 10000;
// var COUNT = 100;

// Basic doc
var doc = {
    doc:'hello', 
    long:Long.fromNumber(100), 
    timestamp:Timestamp.fromNumber(10000),
    minKey:new MinKey(),
    maxKey:new MaxKey(),
    symbol:new Symbol("hello"),
    binary:new Binary(new Buffer('Hello world')),
    objectId: ObjectID.createFromHexString("4ef48c19a9af58a399000001"),
    double: new Double(32.33),
    code: new Code("function() {}", {}),
    code_w_scope: new Code("function() {}", {c:1}),
    dbref: new DBRef('collection', new ObjectID(), 'db'),
    object: {
      a: 1,
      b: 'hello',
      c: {
        long:Long.fromNumber(100)
      }
    }
  };

// var doc2 = {
//     doc:'hello', 
//     long:Long2.fromNumber(100), 
//     timestamp:Timestamp2.fromNumber(10000),
//     minKey:new MinKey2(),
//     maxKey:new MaxKey2(),
//     symbol:new Symbol2("hello"),
//     binary:new Binary2(new Buffer('Hello world')),
//     objectId: ObjectID2.createFromHexString("4ef48c19a9af58a399000001"),
//     double: new Double2(32.33),
//     code: new Code2("function() {}", {}),
//     code_w_scope: new Code2("function() {}", {c:1}),
//     dbref: new DBRef2('collection', new ObjectID2(), 'db'),
//     object: {
//       a: 1,
//       b: 'hello',
//       c: {
//         long:Long2.fromNumber(100)
//       }
//     }
//   };
//   
// var docBin1 = BSONJS.serialize({code_w_scope: new Code("function() {}", {c:1})}, false, true);
// var docBin2 = bsonC.serialize({code_w_scope: new Code("function() {}", {c:1})}, false, true);
// 
// console.log("------------------------------------------------------------------------------ JS")
// console.dir(docBin1.length)
// console.log(docBin1.toString('hex'))
// console.log("------------------------------------------------------------------------------ C++")
// console.dir(docBin2.length)
// console.log(docBin2.toString('hex'))
// 
// var doc = { '$eval': new Code('function (x) {return x;}', {}), args: [ 3 ] };
// var doc = { '$eval': new Code('function (x) {return x;}', {}), args: [ 3 ], nolock: true };
// var doc = { '$eval': new Code('function (x) {db.test_eval.save({y:x});}', {}), args: [ 5 ] };
// var doc = { '$eval': new Code('function (x, y) {return x + y;}', {}), args: [ 2, 3 ] };

// var doc = { '$eval': new Code('function () {return 5;}', {}), args: [ [Function] ] }
// -------------------------------------------------- 002 
// ----------------------------------------------------
// { '$eval': { _bsontype: 'Code', code: '2 + 3;', scope: {} },
//   args: [ [Function] ] }
// -------------------------------------------------- 002 
// ----------------------------------------------------
// { '$eval': { _bsontype: 'Code', code: '2 + 3;', scope: {} },
//   args: [ [Function] ] }
// -------------------------------------------------- 002 
// ----------------------------------------------------
// { '$eval': { _bsontype: 'Code', code: 'return i;', scope: { i: 2 } },
//   args: [ [Function] ] }
// -------------------------------------------------- 001 
// ----------------------------------------------------
// { '$eval': { _bsontype: 'Code', code: 'i + 3;', scope: { i: 2 } },
//   args: [ [Function] ] }
// -------------------------------------------------- 001 
// ----------------------------------------------------
// { '$eval': { _bsontype: 'Code', code: '5 ++ 5;', scope: {} },
//   args: [ [Function] ] }
// 
// // var doc = { '$eval': new Code('function (x, y) {return x + y;}', {}), args: [ 2, 3 ]}
// var docBin1 = BSONJS.serialize(doc, false, true);
// var docBin2 = bsonC.serialize(doc, false, true);
// 
// console.log("------------------------------------------------------------------------------ JS")
// console.dir(docBin1.length)
// console.log(docBin1.toString('hex'))
// // console.log(docBin1.toString('ascii'))
// console.log("------------------------------------------------------------------------------ C++")
// console.dir(docBin2.length)
// console.log(docBin2.toString('hex'))
// // console.log(docBin2.toString('ascii'))
// 
// assert.equal(docBin1.toString('hex'), docBin2.toString('hex'));
// 
// var docBin1 = BSONJS.serialize({test:undefined}, false, true);
// var docBin2 = bsonC.serialize({test:undefined}, false, true);
// 
// console.log("------------------------------------------------------------------------------ JS")
// console.dir(docBin1.length)
// console.log(docBin1.toString('hex'))
// console.log("------------------------------------------------------------------------------ C++")
// console.dir(docBin2.length)
// console.log(docBin2.toString('hex'))

  
// Serialized document
var docBin = BSONJS.serialize(doc, false, true);

// // --------------------------------------------------------------------------------------
// // --------------------------------------------------------------------------------------
// // Serialize performance
// // --------------------------------------------------------------------------------------
// // --------------------------------------------------------------------------------------
// console.log("----------------------------------------------------- serialize bson");
// // Some quick benchmark of using a js object vs a c++ object
// var startTimeS1 = new Date().getTime();
// 
// for(var i = 0; i < COUNT; i++) {
//   bsonC.serialize(doc, false, true);
// }
// 
// // Calculate delta
// var deltaTimeS1 = new Date().getTime() - startTimeS1;
// console.log("C++ with js objects = " + (deltaTimeS1));
// 
// var startTimeS2 = new Date().getTime();
// 
// for(var i = 0; i < COUNT; i++) {
//   BSON.serialize(doc2, false, true);
// }
// 
// // Calculate delta
// var deltaTimeS2 = new Date().getTime() - startTimeS2;
// console.log("C++ with c++ objects = " + (deltaTimeS2));
// 
// var startTimeS3 = new Date().getTime();
// 
// for(var i = 0; i < COUNT; i++) {
//   BSONJS.serialize(doc, false, true);
// }
// 
// var deltaTimeS3 = new Date().getTime() - startTimeS3;
// console.log("JS with js objects = " + (deltaTimeS3));
// 
// // --------------------------------------------------------------------------------------
// // --------------------------------------------------------------------------------------
// // Calculate sizes
// // --------------------------------------------------------------------------------------
// // --------------------------------------------------------------------------------------
// // Some quick benchmark of using a js object vs a c++ object
// console.log("----------------------------------------------------- calculate bson object size");
// var startTimeC1 = new Date().getTime();
// 
// for(var i = 0; i < COUNT; i++) {
//   bsonC.calculateObjectSize(doc);
// }
// 
// var deltaTimeC1 = new Date().getTime() - startTimeC1;
// console.log("C++ with js objects = " + (deltaTimeC1));
// 
// var startTimeC2 = new Date().getTime();
// 
// for(var i = 0; i < COUNT; i++) {
//   BSON.calculateObjectSize(doc2);
// }
// 
// var deltaTimeC2 = new Date().getTime() - startTimeC2;
// console.log("C++ with c++ objects = " + (deltaTimeC2));
// 
// var startTimeC3 = new Date().getTime();
// 
// for(var i = 0; i < COUNT; i++) {
//   BSONJS.calculateObjectSize(doc);
// }
// 
// var deltaTimeC3 = new Date().getTime() - startTimeC3;
// console.log("JS with js objects = " + (deltaTimeC3));
// 
// // --------------------------------------------------------------------------------------
// // --------------------------------------------------------------------------------------
// // Deserialize sizes
// // --------------------------------------------------------------------------------------
// // --------------------------------------------------------------------------------------
// // Some quick benchmark of using a js object vs a c++ object
// console.log("----------------------------------------------------- deserialize bson");
// var startTimeD1 = new Date().getTime();
// 
// for(var i = 0; i < COUNT; i++) {
//   bsonC.deserialize(docBin);
// }
// 
// var deltaTimeD1 = new Date().getTime() - startTimeD1;
// console.log("C++ with js objects = " + (deltaTimeD1));
// 
// var startTimeD3 = new Date().getTime();
// 
// for(var i = 0; i < COUNT; i++) {
//   BSONJS.deserialize(docBin);
// }
// 
// var deltaTimeD3 = new Date().getTime() - startTimeD3;
// console.log("JS with js objects = " + (deltaTimeD3));
// 
// // --------------------------------------------------------------------------------------
// // --------------------------------------------------------------------------------------
// // Final totals
// // --------------------------------------------------------------------------------------
// // --------------------------------------------------------------------------------------
// // Calculate the deltas
// var total1 = (deltaTimeS1 + deltaTimeC1 + deltaTimeD1);
// var total2 = (deltaTimeS2 + deltaTimeC2 + deltaTimeD2);
// var total3 = (deltaTimeS3 + deltaTimeC3 + deltaTimeD3);
// 
// // Print all the deltas
// console.log("//////////////////////////////////////////////////////////////////// FINAL NUMBERS");
// console.log("C++ parser with JS objects :: " + total1);
// console.log("C++ parser with c++ objects :: " + total2);
// console.log("JS parser with js objects :: " + total3);
// 
// console.log("//////////////////////////////////////////////////////////////////// COMPARISONS");
// // Calculate difference from js version
// console.log("C++ parser with JS compared to js :: " + Math.round((((total3 - total1) / total3) * 100)) + "%");
// console.log("C++ parser with C++ compared to js :: " + Math.round((((total3 - total2) / total3) * 100)) + "%");



