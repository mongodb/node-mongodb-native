var Buffer = require('buffer').Buffer,
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
  Timestamp = require('../../../lib/mongodb/bson/bson').Timestamp,  
  assert = require('assert');
 
var Long2 = require('../bson').Long,
    ObjectID2 = require('../bson').ObjectID,
    Binary2 = require('../bson').Binary,
    Code2 = require('../bson').Code,
    Symbol2 = require('../bson').Symbol,
    Double2 = require('../bson').Double,
    Timestamp2 = require('../bson').Timestamp,
    DBRef2 = require('../bson').DBRef;

console.log("=== EXECUTING TEST_FULL_BSON ===");

// // Number of iterations for the benchmark
// var COUNT = 100000;
// // Sample simple doc
// // var doc = {key:"Hello world"};
// var doc = {};
// for(var i = 0; i < 100; i++) {
//   doc['string' + i] = "dumdyms fsdfdsfdsfdsfsdfdsfsdfsdfsdfsdfsdfsdfsdffsfsdfs";
// }
// 
// // Calculate size
// console.log(BSON.calculateObjectSize2(doc));
// console.log(BSONJS.calculateObjectSize(doc));
// assert.equal(BSONJS.calculateObjectSize(doc), BSON.calculateObjectSize2(doc));
// 
// // Serialize the content
// var _serializedDoc1 = BSONJS.serialize(doc, true, false);
// var _serializedDoc2 = BSON.serialize2(doc, true, false);
// console.dir(_serializedDoc1);
// console.dir(_serializedDoc2);
// assert.equal(_serializedDoc1.toString('hex'), _serializedDoc2.toString('hex'))
// 
// 
// // Benchmark 1
// console.log(COUNT + "x (objectBSON = BSON.serialize(object))")
// start = new Date
// 
// for (j=COUNT; --j>=0; ) {  
//   // var objectBSON = BSON.serialize2(doc, true, false);
//   var objectBSON = BSONJS.serialize(doc, true, false);
// }
// 
// end = new Date
// var opsprsecond = COUNT / ((end - start)/1000);
// console.log("bson size (bytes): ", objectBSON.length);
// console.log("time = ", end - start, "ms -", COUNT / ((end - start)/1000), " ops/sec");
// console.log("MB/s = " + ((opsprsecond*objectBSON.length)/1024));
// 
// // Benchmark 2
// console.log(COUNT + "x (objectBSON = BSON.serialize(object))")
// start = new Date
// 
// for (j=COUNT; --j>=0; ) {  
//   var objectBSON = BSON.serialize2(doc, true, false);
// }
// 
// end = new Date
// var opsprsecond = COUNT / ((end - start)/1000);
// console.log("bson size (bytes): ", objectBSON.length);
// console.log("time = ", end - start, "ms -", COUNT / ((end - start)/1000), " ops/sec");
// console.log("MB/s = " + ((opsprsecond*objectBSON.length)/1024));
// 
// // Benchmark 3
// console.log(COUNT + "x (objectBSON = BSON.serialize(object))")
// start = new Date
// 
// for (j=COUNT; --j>=0; ) {  
//   var objectBSON = BSON.serialize(doc, true, false);
// }
// 
// end = new Date
// var opsprsecond = COUNT / ((end - start)/1000);
// console.log("bson size (bytes): ", objectBSON.length);
// console.log("time = ", end - start, "ms -", COUNT / ((end - start)/1000), " ops/sec");
// console.log("MB/s = " + ((opsprsecond*objectBSON.length)/1024));
