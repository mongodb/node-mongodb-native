var BSON = require('../lib/mongodb').BSONNative.BSON,
  ObjectID = require('../lib/mongodb').BSONNative.ObjectID,
  Code = require('../lib/mongodb').BSONNative.Code,
  Long = require('../lib/mongodb').BSONNative.Long,
  Binary = require('../lib/mongodb').BSONNative.Binary,
  debug = require('util').debug,
  inspect = require('util').inspect;

var BSON = require('../lib/mongodb').BSONPure.BSON,
  ObjectID = require('../lib/mongodb').BSONPure.ObjectID,
  Code = require('../lib/mongodb').BSONPure.Code,
  Long = require('../lib/mongodb').BSONPure.Long,
  Binary = require('../lib/mongodb').BSONPure.Binary;

var COUNT = 100000;
var COUNT = 100;

var object = {
  string: "Strings are great",
  decimal: 3.14159265,
  bool: true,
  integer: 5,
  long: Long.fromNumber(100),
  bin: new Binary(),
  
  subObject: {
    moreText: "Bacon ipsum dolor sit amet cow pork belly rump ribeye pastrami andouille. Tail hamburger pork belly, drumstick flank salami t-bone sirloin pork chop ribeye ham chuck pork loin shankle. Ham fatback pork swine, sirloin shankle short loin andouille shank sausage meatloaf drumstick. Pig chicken cow bresaola, pork loin jerky meatball tenderloin brisket strip steak jowl spare ribs. Biltong sirloin pork belly boudin, bacon pastrami rump chicken. Jowl rump fatback, biltong bacon t-bone turkey. Turkey pork loin boudin, tenderloin jerky beef ribs pastrami spare ribs biltong pork chop beef.",
    longKeylongKeylongKeylongKeylongKeylongKey: "Pork belly boudin shoulder ribeye pork chop brisket biltong short ribs. Salami beef pork belly, t-bone sirloin meatloaf tail jowl spare ribs. Sirloin biltong bresaola cow turkey. Biltong fatback meatball, bresaola tail shankle turkey pancetta ham ribeye flank bacon jerky pork chop. Boudin sirloin shoulder, salami swine flank jerky t-bone pork chop pork beef tongue. Bresaola ribeye jerky andouille. Ribeye ground round sausage biltong beef ribs chuck, shank hamburger chicken short ribs spare ribs tenderloin meatloaf pork loin."
  },
  
  subArray: [1,2,3,4,5,6,7,8,9,10],
  anotherString: "another string",
  code: new Code("function() {}", {i:1})
}

// var object = {
//   string: "Strings are great",
//   // decimal: 3.14159265,
//   // bool: true,
//   // integer: 5,
//   // 
//   // subObject: {
//   //   moreText: "Bacon ipsum dolor sit amet cow pork belly rump ribeye pastrami andouille. Tail hamburger pork belly, drumstick flank salami t-bone sirloin pork chop ribeye ham chuck pork loin shankle. Ham fatback pork swine, sirloin shankle short loin andouille shank sausage meatloaf drumstick. Pig chicken cow bresaola, pork loin jerky meatball tenderloin brisket strip steak jowl spare ribs. Biltong sirloin pork belly boudin, bacon pastrami rump chicken. Jowl rump fatback, biltong bacon t-bone turkey. Turkey pork loin boudin, tenderloin jerky beef ribs pastrami spare ribs biltong pork chop beef.",
//   //   longKeylongKeylongKeylongKeylongKeylongKey: "Pork belly boudin shoulder ribeye pork chop brisket biltong short ribs. Salami beef pork belly, t-bone sirloin meatloaf tail jowl spare ribs. Sirloin biltong bresaola cow turkey. Biltong fatback meatball, bresaola tail shankle turkey pancetta ham ribeye flank bacon jerky pork chop. Boudin sirloin shoulder, salami swine flank jerky t-bone pork chop pork beef tongue. Bresaola ribeye jerky andouille. Ribeye ground round sausage biltong beef ribs chuck, shank hamburger chicken short ribs spare ribs tenderloin meatloaf pork loin."
//   // },
//   // 
//   subArray: [1,2,3,4,5,6,7,8,9,10],
//   // anotherString: "another string",
//   // code: new Code("function() {}", {i:1})
// }

// for (i=10000; --i>=0; ) {  
//   objectBSON = BSON.serialize(object, null, true)
// }
// 
var x, start, end, j
var objectBSON, objectJSON

console.log(COUNT + "x (objectBSON = BSON.serialize(object))")
start = new Date

// // var object = {
// //   '_id': new ObjectID(),
// //   'x': 1,
// //   'integer':5,
// //   'number':5.05,
// //   'boolean':false,
// //   'array':['test', 'benchmark']
// // }
// 
for (j=COUNT; --j>=0; ) {  
//   // var object = {
//   //   string: "Strings are great",
//   //   decimal: 3.14159265,
//   //   bool: true,
//   //   integer: 5,
//   //   subObject: {
//   //       moreText: "Bacon ipsum dolor sit amet cow pork belly rump ribeye pastrami andouille. Tail hamburger pork belly, drumstick flank salami t-bone sirloin pork chop ribeye ham chuck pork loin shankle. Ham fatback pork swine, sirloin shankle short loin andouille shank sausage meatloaf drumstick. Pig chicken cow bresaola, pork loin jerky meatball tenderloin brisket strip steak jowl spare ribs. Biltong sirloin pork belly boudin, bacon pastrami rump chicken. Jowl rump fatback, biltong bacon t-bone turkey. Turkey pork loin boudin, tenderloin jerky beef ribs pastrami spare ribs biltong pork chop beef.",
//   //       longKeylongKeylongKeylongKeylongKeylongKey: "Pork belly boudin shoulder ribeye pork chop brisket biltong short ribs. Salami beef pork belly, t-bone sirloin meatloaf tail jowl spare ribs. Sirloin biltong bresaola cow turkey. Biltong fatback meatball, bresaola tail shankle turkey pancetta ham ribeye flank bacon jerky pork chop. Boudin sirloin shoulder, salami swine flank jerky t-bone pork chop pork beef tongue. Bresaola ribeye jerky andouille. Ribeye ground round sausage biltong beef ribs chuck, shank hamburger chicken short ribs spare ribs tenderloin meatloaf pork loin."
//   //   },
//   //   subArray: [1,2,3,4,5,6,7,8,9,10],
//   //   anotherString: "another string"
//   // }
// 
//   // debug("============== calculateObjectSize :: " + BSON.calculateObjectSize(object))
//   // debug("============== _calculateObjectSize :: " + BSON._calculateObjectSize(object))
//   // BSON._calculateObjectSize(object);
//   // BSON.calculateObjectSize(object);
// 
//   objectBSON = BSON.serialize(object, null, true)
//   // objectBSON = BSON._serialize(object, null, true)
// 
//   // var b = BSON.deserialize(objectBSON);
// 
//   // debug(inspect(b))
// 

var doc = {};
for(var i = 0; i < 1; i++) {
    doc['timestamp' + i] = Date.now();
}
var docs = [];
for(var i = 0; i < 1; i++) {
    docs.push(doc);
}

var object = {'doc':docs}
debug(inspect(object))

BSON.calculateObjectSize(object);

  // objectBSON = BSON.serialize(object, null, true)
// 
//   // var b = BSON.deserialize(objectBSON);
// 
//   // debug(inspect(b))
}

// // debug(inspect(objectBSON))
// 
// end = new Date
// // console.log("bson size (bytes): ", objectBSON.length)
// console.log("time = ", end - start, "ms -", COUNT * 1000 / (end - start), " ops/sec")
// 
// var COUNT = 1000000;
// // var COUNT = 1;
// 
// console.log(COUNT + "x (objectBSON = BSON.serialize(object))")
// start = new Date
// 
// // // var object = {
// // //   '_id': new ObjectID(),
// // //   'x': 1,
// // //   'integer':5,
// // //   'number':5.05,
// // //   'boolean':false,
// // //   'array':['test', 'benchmark']
// // // }
// 
// for (i=COUNT; --i>=0; ) {  
//   // var object = {
//   //   string: "Strings are great",
//   //   decimal: 3.14159265,
//   //   bool: true,
//   //   integer: 5,
//   //   subObject: {
//   //       moreText: "Bacon ipsum dolor sit amet cow pork belly rump ribeye pastrami andouille. Tail hamburger pork belly, drumstick flank salami t-bone sirloin pork chop ribeye ham chuck pork loin shankle. Ham fatback pork swine, sirloin shankle short loin andouille shank sausage meatloaf drumstick. Pig chicken cow bresaola, pork loin jerky meatball tenderloin brisket strip steak jowl spare ribs. Biltong sirloin pork belly boudin, bacon pastrami rump chicken. Jowl rump fatback, biltong bacon t-bone turkey. Turkey pork loin boudin, tenderloin jerky beef ribs pastrami spare ribs biltong pork chop beef.",
//   //       longKeylongKeylongKeylongKeylongKeylongKey: "Pork belly boudin shoulder ribeye pork chop brisket biltong short ribs. Salami beef pork belly, t-bone sirloin meatloaf tail jowl spare ribs. Sirloin biltong bresaola cow turkey. Biltong fatback meatball, bresaola tail shankle turkey pancetta ham ribeye flank bacon jerky pork chop. Boudin sirloin shoulder, salami swine flank jerky t-bone pork chop pork beef tongue. Bresaola ribeye jerky andouille. Ribeye ground round sausage biltong beef ribs chuck, shank hamburger chicken short ribs spare ribs tenderloin meatloaf pork loin."
//   //   },
//   //   subArray: [1,2,3,4,5,6,7,8,9,10],
//   //   anotherString: "another string"
//   // }
// 
//   // debug("============== calculateObjectSize :: " + BSON.calculateObjectSize(object))
//   // debug("============== _calculateObjectSize :: " + BSON._calculateObjectSize(object))
//   // BSON._calculateObjectSize(object);
//   // BSON._calculateObjectSize(object);
//   
//   // objectBSON = BSON.serialize(object, null, true)
//   object = BSON.deserialize(objectBSON);
// }
// 
// // // debug(inspect(objectBSON))
// // 
// end = new Date
// // console.log("bson size (bytes): ", objectBSON.length)
// console.log("time = ", end - start, "ms -", COUNT * 1000 / (end - start), " ops/sec")
// 
// // debug("-------------------------------------------------------------")
// // debug(object)
// 
// 
// // // var COUNT = 1000000;
// // 
// // // console.log(COUNT + "x (objectJSON = JSON.stringify(object))")
// // // start = new Date
// // // 
// // // for (i=COUNT; --i>=0; ) {
// // //     objectJSON = JSON.stringify(object)
// // // }
// // // 
// // // end = new Date
// // console.log("json size (chars): ", objectJSON.length)
// // console.log("time = ", end - start, "ms -", COUNT * 1000 / (end - start), " ops/sec")
// // 
// // var COUNT = 1000000;
// // var COUNT = 1;
// // 
// // console.log(COUNT + " BSON.deserialize(objectBSON)")
// // var COUNT = 1000000;
// // 
// // start = new Date
// // 
// // for (i=COUNT; --i>=0; ) {
// //   x = BSON.deserialize(objectBSON)
// // }
// // 
// // end = new Date
// // console.log("time = ", end - start, "ms -", COUNT * 1000 / (end - start), " ops/sec")
// // 
// // 
// // debug(inspect(x))
// 
// // console.log(COUNT + " JSON.parse(objectJSON)")
// // start = new Date
// // 
// // for (i=COUNT; --i>=0; ) {
// //     x = JSON.parse(objectJSON)
// // }
// // 
// // end = new Date
// // console.log("time = ", end - start, "ms -", COUNT * 1000 / (end - start), " ops/sec")
