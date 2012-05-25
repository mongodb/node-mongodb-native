var BSON = require('/Users/christiankvalheim/coding/checkout/node-buffalo/buffalo')
var mongoNative = require('../../lib/mongodb'),
  assert = require('assert'),
  Long = mongoNative.Long,
  ObjectID = mongoNative.ObjectID,
  Binary = mongoNative.Binary,
  Code = mongoNative.Code,  
  DBRef = mongoNative.DBRef,  
  Symbol = mongoNative.Symbol,  
  Double = mongoNative.Double,  
  MaxKey = mongoNative.MaxKey,  
  MinKey = mongoNative.MinKey,  
  Timestamp = mongoNative.Timestamp;
  
var BSONPure = new mongoNative.BSONPure.BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey]);
var BSONNative = new mongoNative.BSONNative.BSON([Long, ObjectID, Binary, Code, DBRef, Symbol, Double, Timestamp, MaxKey, MinKey]);

// var COUNT = 500000
var COUNT = 100000
var COUNT = 20000
// var COUNT = 10000
// var COUNT = 1

// Function with scope
var function2 = function() {};
function2.scope = {a:1};

var object = {
    string: "Strings are great",
    obj: {
      string2: "This is String 2",
    },
    
    decimal: 3.14159265,
    'undefined': undefined,
    bool: true,
    integer: 5,
    regexp:/fdfdfd/mig,
    regexp:/fdfdfd/,
    subObject: {
      moreText: "Bacon ipsum dolor sit amet cow pork belly rump ribeye pastrami andouille. Tail hamburger pork belly, drumstick flank salami t-bone sirloin pork chop ribeye ham chuck pork loin shankle. Ham fatback pork swine, sirloin shankle short loin andouille shank sausage meatloaf drumstick. Pig chicken cow bresaola, pork loin jerky meatball tenderloin brisket strip steak jowl spare ribs. Biltong sirloin pork belly boudin, bacon pastrami rump chicken. Jowl rump fatback, biltong bacon t-bone turkey. Turkey pork loin boudin, tenderloin jerky beef ribs pastrami spare ribs biltong pork chop beef.",
      longKeylongKeylongKeylongKeylongKeylongKey: "Pork belly boudin shoulder ribeye pork chop brisket biltong short ribs. Salami beef pork belly, t-bone sirloin meatloaf tail jowl spare ribs. Sirloin biltong bresaola cow turkey. Biltong fatback meatball, bresaola tail shankle turkey pancetta ham ribeye flank bacon jerky pork chop. Boudin sirloin shoulder, salami swine flank jerky t-bone pork chop pork beef tongue. Bresaola ribeye jerky andouille. Ribeye ground round sausage biltong beef ribs chuck, shank hamburger chicken short ribs spare ribs tenderloin meatloaf pork loin.",
          
      subObject: {
          moreText: "Bacon ipsum dolor sit amet cow pork belly rump ribeye pastrami andouille. Tail hamburger pork belly, drumstick flank salami t-bone sirloin pork chop ribeye ham chuck pork loin shankle. Ham fatback pork swine, sirloin shankle short loin andouille shank sausage meatloaf drumstick. Pig chicken cow bresaola, pork loin jerky meatball tenderloin brisket strip steak jowl spare ribs. Biltong sirloin pork belly boudin, bacon pastrami rump chicken. Jowl rump fatback, biltong bacon t-bone turkey. Turkey pork loin boudin, tenderloin jerky beef ribs pastrami spare ribs biltong pork chop beef.",
          longKeylongKeylongKeylongKeylongKeylongKey: "Pork belly boudin shoulder ribeye pork chop brisket biltong short ribs. Salami beef pork belly, t-bone sirloin meatloaf tail jowl spare ribs. Sirloin biltong bresaola cow turkey. Biltong fatback meatball, bresaola tail shankle turkey pancetta ham ribeye flank bacon jerky pork chop. Boudin sirloin shoulder, salami swine flank jerky t-bone pork chop pork beef tongue. Bresaola ribeye jerky andouille. Ribeye ground round sausage biltong beef ribs chuck, shank hamburger chicken short ribs spare ribs tenderloin meatloaf pork loin."
      }
    },    
    dbref: new DBRef('collection', new ObjectID(), 'db'),
    long: Long.fromNumber(1000),
    double: new Double(3.14),
    code1: new Code((function() {}).toString(), {a:1}),
    code: new Code((function() {}).toString()),
    minKey: new MinKey(),
    maxKey: new MaxKey(),
    objectId: new ObjectID(),
    binary: new Binary('hello world'),
    symbol: new Symbol('hello'),
    timestamp: Timestamp.fromNumber(1000),    
    date: new Date(),
    function1: function() {},
    function2: function2,
    // buffer:new Buffer('hello world'),
    'null': null,
    subArray: [1,2,3,4,5,6,7,8,9,10],
    anotherString: "another string"
}

var start = new Date
for (i=COUNT; --i>=0; ) {
  // calculate1 = BSONPure.calculateObjectSize(object, true);
  serialize1 = BSONPure.serialize(object, null, true)
}
var end = new Date
console.log(COUNT + "x BSONPure.calculateObjectSize(object) time = ", end - start, "ms -", COUNT * 1000 / (end - start), " ops/sec")

start = new Date
for (i=COUNT; --i>=0; ) {
  // calculate2 = BSONNative.calculateObjectSize(object, true);
  serialize2 = BSONNative.serialize(object, null, true)
}
end = new Date
console.log(COUNT + "x BSONNative.calculateObjectSize(object) time = ", end - start, "ms -", COUNT * 1000 / (end - start), " ops/sec")


// start = new Date
// for (i=COUNT; --i>=0; ) {
//   // calculate3 = BSONNative.calculateObjectSize2(object)
//   serialize3 = BSONNative.serialize2(object, null, true)
// }
// end = new Date
// console.log(COUNT + "x BSONNative.calculateObjectSize2(object) time = ", end - start, "ms -", COUNT * 1000 / (end - start), " ops/sec")

// console.log("----------------------------------------------------------------------- size");
// console.log("calculate1 = " + calculate1);
// console.log("calculate2 = " + calculate2);
// console.log("calculate3 = " + calculate3);

// console.log("----------------------------------------------------------------------- serialize");
// console.log(serialize1.toString('base64'))
// console.log(serialize2.toString('base64'))
// console.log(serialize3.toString('base64'))

function compare(b1, b2) {
    try {
        require('assert').deepEqual(b1,b2)
        return true
    } catch (e) {
        console.error(e)
        return false
    }
}
