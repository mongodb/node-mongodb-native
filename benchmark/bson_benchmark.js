var BSON = require('../lib/mongodb').BSONNative.BSON,
  ObjectID = require('../lib/mongodb').BSONNative.ObjectID,
  Code = require('../lib/mongodb').BSONNative.Code,
  Long = require('../lib/mongodb').BSONNative.Long,
  Binary = require('../lib/mongodb').BSONNative.Binary,
  debug = require('util').debug,
  inspect = require('util').inspect;

// var BSON = require('../lib/mongodb').BSONPure.BSON,
//   ObjectID = require('../lib/mongodb').BSONPure.ObjectID,
//   Code = require('../lib/mongodb').BSONPure.Code,
//   Long = require('../lib/mongodb').BSONPure.Long,
//   Binary = require('../lib/mongodb').BSONPure.Binary;

var COUNT = 1000;
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

// Number of objects
var numberOfObjects = 100;
// var numberOfObjects = 2;

// Object serialized
objectBSON = BSON.serialize(object, null, true)

// Buffer With copies of the objectBSON
var data = new Buffer(objectBSON.length * numberOfObjects);
var index = 0;

// Copy the buffer 1000 times to create a strea m of objects
for(var i = 0; i < numberOfObjects; i++) {
  // Copy data
  objectBSON.copy(data, index);
  // Adjust index
  index = index + objectBSON.length;
}

// console.log("-----------------------------------------------------------------------------------")
// console.dir(objectBSON)

var x, start, end, j
var objectBSON, objectJSON

// Allocate the return array (avoid concatinating everything)
var results = new Array(numberOfObjects);

console.log(COUNT + "x (objectBSON = BSON.serialize(object))")
start = new Date

// var objects = BSON.deserializeStream(data, 0, numberOfObjects);
// console.log("----------------------------------------------------------------------------------- 0")
// var objects = BSON.deserialize(data);
// console.log("----------------------------------------------------------------------------------- 1")
// console.dir(objects)

for (j=COUNT; --j>=0; ) {  
  var nextIndex = BSON.deserializeStream(data, 0, numberOfObjects, results, 0);
}

end = new Date
var opsprsecond = COUNT / ((end - start)/1000);
console.log("bson size (bytes): ", objectBSON.length);
console.log("time = ", end - start, "ms -", COUNT / ((end - start)/1000), " ops/sec");
console.log("MB/s = " + ((opsprsecond*objectBSON.length)/1024));

// console.dir(nextIndex)
// console.dir(results)


