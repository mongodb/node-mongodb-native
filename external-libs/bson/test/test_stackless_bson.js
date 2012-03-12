var Buffer = require('buffer').Buffer,
  BSON = require('../bson').BSON,
  Buffer = require('buffer').Buffer,
  BSONJS = require('../../../lib/mongodb/bson/bson').BSON,
  BinaryParser = require('../../../lib/mongodb/bson/binary_parser').BinaryParser,
  Long = require('../../../lib/mongodb/bson/long').Long,
  ObjectID = require('../../../lib/mongodb/bson/bson').ObjectID,
  Binary = require('../../../lib/mongodb/bson/bson').Binary,
  Code = require('../../../lib/mongodb/bson/bson').Code,  
  DBRef = require('../../../lib/mongodb/bson/bson').DBRef,  
  Symbol = require('../../../lib/mongodb/bson/bson').Symbol,  
  Double = require('../../../lib/mongodb/bson/bson').Double,  
  MaxKey = require('../../../lib/mongodb/bson/bson').MaxKey,  
  MinKey = require('../../../lib/mongodb/bson/bson').MinKey,  
  Timestamp = require('../../../lib/mongodb/bson/bson').Timestamp;
  assert = require('assert');

if(process.env['npm_package_config_native'] != null) return;
 
console.log("=== EXECUTING TEST_STACKLESS_BSON ===");

// Parsers
var bsonC = new BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey]);
var bsonJS = new BSONJS([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey]);

// Number of iterations for the benchmark
var COUNT = 10000;
// var COUNT = 1;
// Sample simple doc
var doc = {key:"Hello world", key2:"šđžčćŠĐŽČĆ", key3:'客家话', key4:'how are you doing dog!!'};
// var doc = {};
// for(var i = 0; i < 100; i++) {
//   doc['string' + i] = "dumdyms fsdfdsfdsfdsfsdfdsfsdfsdfsdfsdfsdfsdfsdffsfsdfs";  
// }

// // Calculate size
console.log(bsonC.calculateObjectSize2(doc));
console.log(bsonJS.calculateObjectSize(doc));
// assert.equal(bsonJS.calculateObjectSize(doc), bsonC.calculateObjectSize2(doc));

// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------
// Benchmark calculateObjectSize
// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------

// Benchmark 1 JS BSON
console.log(COUNT + "x (objectBSON = bsonC.calculateObjectSize(object))")
start = new Date

for (j=COUNT; --j>=0; ) {  
  var objectBSON = bsonJS.calculateObjectSize(doc);
}

end = new Date
var opsprsecond = COUNT / ((end - start)/1000);
console.log("time = ", end - start, "ms -", COUNT / ((end - start)/1000), " ops/sec");

// Benchmark 2 C++ BSON calculateObjectSize
console.log(COUNT + "x (objectBSON = bsonC.calculateObjectSize(object))")
start = new Date

for (j=COUNT; --j>=0; ) {  
  var objectBSON = bsonC.calculateObjectSize(doc);
}

end = new Date
var opsprsecond = COUNT / ((end - start)/1000);
console.log("time = ", end - start, "ms -", COUNT / ((end - start)/1000), " ops/sec");

// Benchmark 3 C++ BSON calculateObjectSize2
console.log(COUNT + "x (objectBSON = bsonC.calculateObjectSize2(object))")
start = new Date

for (j=COUNT; --j>=0; ) {  
  var objectBSON = bsonC.calculateObjectSize2(doc);
}

end = new Date
var opsprsecond = COUNT / ((end - start)/1000);
console.log("time = ", end - start, "ms -", COUNT / ((end - start)/1000), " ops/sec");

// // Serialize the content
// var _serializedDoc1 = bsonJS.serialize(doc, true, false);
// var _serializedDoc2 = bsonC.serialize2(doc, true, false);
// console.dir(_serializedDoc1);
// console.dir(_serializedDoc2);
// assert.equal(_serializedDoc1.toString('base64'), _serializedDoc2.toString('base64'))
// 
// 
// // Benchmark 1
// console.log(COUNT + "x (objectBSON = bsonC.serialize(object))")
// start = new Date
// 
// for (j=COUNT; --j>=0; ) {  
//   // var objectBSON = bsonC.serialize2(doc, true, false);
//   var objectBSON = bsonJS.serialize(doc, true, false);
// }
// 
// end = new Date
// var opsprsecond = COUNT / ((end - start)/1000);
// console.log("bson size (bytes): ", objectbsonC.length);
// console.log("time = ", end - start, "ms -", COUNT / ((end - start)/1000), " ops/sec");
// console.log("MB/s = " + ((opsprsecond*objectbsonC.length)/1024));
// 
// // Benchmark 2
// console.log(COUNT + "x (objectBSON = bsonC.serialize(object))")
// start = new Date
// 
// for (j=COUNT; --j>=0; ) {  
//   var objectBSON = bsonC.serialize2(doc, true, false);
// }
// 
// end = new Date
// var opsprsecond = COUNT / ((end - start)/1000);
// console.log("bson size (bytes): ", objectbsonC.length);
// console.log("time = ", end - start, "ms -", COUNT / ((end - start)/1000), " ops/sec");
// console.log("MB/s = " + ((opsprsecond*objectbsonC.length)/1024));
// 
// // Benchmark 3
// console.log(COUNT + "x (objectBSON = bsonC.serialize(object))")
// start = new Date
// 
// for (j=COUNT; --j>=0; ) {  
//   var objectBSON = bsonC.serialize(doc, true, false);
// }
// 
// end = new Date
// var opsprsecond = COUNT / ((end - start)/1000);
// console.log("bson size (bytes): ", objectbsonC.length);
// console.log("time = ", end - start, "ms -", COUNT / ((end - start)/1000), " ops/sec");
// console.log("MB/s = " + ((opsprsecond*objectbsonC.length)/1024));
