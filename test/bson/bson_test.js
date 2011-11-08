var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();

var testCase = require('../../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  Buffer = require('buffer').Buffer,
  gleak = require('../../tools/gleak'),
  fs = require('fs'),
  BSON = mongodb.BSON,
  Code = mongodb.Code, 
  Binary = mongodb.Binary,
  Timestamp = mongodb.Timestamp,
  Long = mongodb.Long,
  MongoReply = mongodb.MongoReply,
  ObjectID = mongodb.ObjectID,
  Symbol = mongodb.Symbol,
  DBRef = mongodb.DBRef,
  Double = mongodb.Double,
  MinKey = mongodb.MinKey,
  MaxKey = mongodb.MaxKey,
  Double = mongodb.Double,
  BinaryParser = mongodb.BinaryParser;

var BSONSE = mongodb,
  BSONDE = mongodb;

// for tests
BSONDE.BSON_BINARY_SUBTYPE_DEFAULT = 0;
BSONDE.BSON_BINARY_SUBTYPE_FUNCTION = 1;
BSONDE.BSON_BINARY_SUBTYPE_BYTE_ARRAY = 2;
BSONDE.BSON_BINARY_SUBTYPE_UUID = 3;
BSONDE.BSON_BINARY_SUBTYPE_MD5 = 4;
BSONDE.BSON_BINARY_SUBTYPE_USER_DEFINED = 128;          

BSONSE.BSON_BINARY_SUBTYPE_DEFAULT = 0;
BSONSE.BSON_BINARY_SUBTYPE_FUNCTION = 1;
BSONSE.BSON_BINARY_SUBTYPE_BYTE_ARRAY = 2;
BSONSE.BSON_BINARY_SUBTYPE_UUID = 3;
BSONSE.BSON_BINARY_SUBTYPE_MD5 = 4;
BSONSE.BSON_BINARY_SUBTYPE_USER_DEFINED = 128;          

var hexStringToBinary = exports.hexStringToBinary = function(string) {
  var numberofValues = string.length / 2;
  var array = "";
  
  for(var i = 0; i < numberofValues; i++) {
    array += String.fromCharCode(parseInt(string[i*2] + string[i*2 + 1], 16));
  }  
  return array;
}

var assertBuffersEqual = function(test, buffer1, buffer2) {  
  if(buffer1.length != buffer2.length) test.fail("Buffers do not have the same length", buffer1, buffer2);
  
  for(var i = 0; i < buffer1.length; i++) {
    test.equal(buffer1[i], buffer2[i]);
  }
}

/**
 * Module for parsing an ISO 8601 formatted string into a Date object.
 */
var ISODate = function (string) {
  var match;

	if (typeof string.getTime === "function")
		return string;
	else if (match = string.match(/^(\d{4})(-(\d{2})(-(\d{2})(T(\d{2}):(\d{2})(:(\d{2})(\.(\d+))?)?(Z|((\+|-)(\d{2}):(\d{2}))))?)?)?$/)) {
		var date = new Date();
		date.setUTCFullYear(Number(match[1]));
		date.setUTCMonth(Number(match[3]) - 1 || 0);
		date.setUTCDate(Number(match[5]) || 0);
		date.setUTCHours(Number(match[7]) || 0);
		date.setUTCMinutes(Number(match[8]) || 0);
		date.setUTCSeconds(Number(match[10]) || 0);
		date.setUTCMilliseconds(Number("." + match[12]) * 1000 || 0);

		if (match[13] && match[13] !== "Z") {
			var h = Number(match[16]) || 0,
			    m = Number(match[17]) || 0;

			h *= 3600000;
			m *= 60000;

			var offset = h + m;
			if (match[15] == "+")
				offset = -offset;

			date = new Date(date.valueOf() + offset);
		}

		return date;
	} else
		throw new Error("Invalid ISO 8601 date given.", __filename);
};

var tests = testCase({
  setUp: function(callback) {
    callback();        
  },
  
  tearDown: function(callback) {
    callback();        
  },

  'Should Correctly Deserialize object' : function(test) {
    var bytes = [95,0,0,0,2,110,115,0,42,0,0,0,105,110,116,101,103,114,97,116,105,111,110,95,116,101,115,116,115,95,46,116,101,115,116,95,105,110,100,101,120,95,105,110,102,111,114,109,97,116,105,111,110,0,8,117,110,105,113,117,101,0,0,3,107,101,121,0,12,0,0,0,16,97,0,1,0,0,0,0,2,110,97,109,101,0,4,0,0,0,97,95,49,0,0];
    var serialized_data = '';
    // Convert to chars
    for(var i = 0; i < bytes.length; i++) {
      serialized_data = serialized_data + BinaryParser.fromByte(bytes[i]);
    }
    var object = BSONDE.BSON.deserialize(new Buffer(serialized_data, 'binary'));
    test.equal("a_1", object.name);
    test.equal(false, object.unique);
    test.equal(1, object.key.a);
    test.done();
  },
    
  'Should Correctly Deserialize object with all types' : function(test) {
    var bytes = [26,1,0,0,7,95,105,100,0,161,190,98,75,118,169,3,0,0,3,0,0,4,97,114,114,97,121,0,26,0,0,0,16,48,0,1,0,0,0,16,49,0,2,0,0,0,16,50,0,3,0,0,0,0,2,115,116,114,105,110,103,0,6,0,0,0,104,101,108,108,111,0,3,104,97,115,104,0,19,0,0,0,16,97,0,1,0,0,0,16,98,0,2,0,0,0,0,9,100,97,116,101,0,161,190,98,75,0,0,0,0,7,111,105,100,0,161,190,98,75,90,217,18,0,0,1,0,0,5,98,105,110,97,114,121,0,7,0,0,0,2,3,0,0,0,49,50,51,16,105,110,116,0,42,0,0,0,1,102,108,111,97,116,0,223,224,11,147,169,170,64,64,11,114,101,103,101,120,112,0,102,111,111,98,97,114,0,105,0,8,98,111,111,108,101,97,110,0,1,15,119,104,101,114,101,0,25,0,0,0,12,0,0,0,116,104,105,115,46,120,32,61,61,32,51,0,5,0,0,0,0,3,100,98,114,101,102,0,37,0,0,0,2,36,114,101,102,0,5,0,0,0,116,101,115,116,0,7,36,105,100,0,161,190,98,75,2,180,1,0,0,2,0,0,0,10,110,117,108,108,0,0];
    var serialized_data = '';
    // Convert to chars
    for(var i = 0; i < bytes.length; i++) {
      serialized_data = serialized_data + BinaryParser.fromByte(bytes[i]);
    }
  
    var object = BSONDE.BSON.deserialize(new Buffer(serialized_data, 'binary'));//, false, true);
    // Perform tests
    test.equal("hello", object.string);
    test.deepEqual([1,2,3], object.array);
    test.equal(1, object.hash.a);
    test.equal(2, object.hash.b);
    test.ok(object.date != null);
    test.ok(object.oid != null);
    test.ok(object.binary != null);
    test.equal(42, object.int);
    test.equal(33.3333, object.float);
    test.ok(object.regexp != null);
    test.equal(true, object.boolean);
    test.ok(object.where != null);
    test.ok(object.dbref != null);
    test.ok(object[null] == null);    
    test.done();
  },
  
  'Should Serialize and Deserialize String' : function(test) {
    var test_string = {hello: 'world'};
    var serialized_data = BSONSE.BSON.serialize(test_string, false, true);
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(test_string));
    BSONSE.BSON.serializeWithBufferAndIndex(test_string, false, serialized_data2, 0);    
  
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
    test.deepEqual(test_string, BSONDE.BSON.deserialize(serialized_data));
    test.done();
  },
  
  'Should Serialize and Deserialize Empty String' : function(test) {
    var test_string = {hello: ''};
    var serialized_data = BSONSE.BSON.serialize(test_string, false, true);
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(test_string));
    BSONSE.BSON.serializeWithBufferAndIndex(test_string, false, serialized_data2, 0);    
  
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
    test.deepEqual(test_string, BSONDE.BSON.deserialize(serialized_data));
    test.done();
  },
  
  'Should Correctly Serialize and Deserialize Integer' : function(test) {    
    var test_number = {doc: 5};
    var serialized_data = BSONSE.BSON.serialize(test_number, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(test_number));
    BSONSE.BSON.serializeWithBufferAndIndex(test_number, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    test.deepEqual(test_number, BSONDE.BSON.deserialize(serialized_data));
    test.done();
  },
  
  'Should Correctly Serialize and Deserialize null value' : function(test) {
    var test_null = {doc:null};
    var serialized_data = BSONSE.BSON.serialize(test_null, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(test_null));
    BSONSE.BSON.serializeWithBufferAndIndex(test_null, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var object = BSONDE.BSON.deserialize(serialized_data);
    test.equal(null, object.doc);
    test.done();
  },
  
  'Should Correctly Serialize and Deserialize Number' : function(test) {
    var test_number = {doc: 5.5};
    var serialized_data = BSONSE.BSON.serialize(test_number, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(test_number));
    BSONSE.BSON.serializeWithBufferAndIndex(test_number, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    test.deepEqual(test_number, BSONDE.BSON.deserialize(serialized_data));
    test.done();    
  },
  
  'Should Correctly Serialize and Deserialize Integer' : function(test) {
    var test_int = {doc: 42};
    var serialized_data = BSONSE.BSON.serialize(test_int, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(test_int));
    BSONSE.BSON.serializeWithBufferAndIndex(test_int, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
    test.deepEqual(test_int.doc, BSONDE.BSON.deserialize(serialized_data).doc);
  
    test_int = {doc: -5600};
    serialized_data = BSONSE.BSON.serialize(test_int, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(test_int));
    BSONSE.BSON.serializeWithBufferAndIndex(test_int, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
    test.deepEqual(test_int.doc, BSONDE.BSON.deserialize(serialized_data).doc);
  
    test_int = {doc: 2147483647};
    serialized_data = BSONSE.BSON.serialize(test_int, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(test_int));
    BSONSE.BSON.serializeWithBufferAndIndex(test_int, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
    test.deepEqual(test_int.doc, BSONDE.BSON.deserialize(serialized_data).doc);
        
    test_int = {doc: -2147483648};
    serialized_data = BSONSE.BSON.serialize(test_int, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(test_int));
    BSONSE.BSON.serializeWithBufferAndIndex(test_int, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
    test.deepEqual(test_int.doc, BSONDE.BSON.deserialize(serialized_data).doc);
    test.done();        
  },
  
  'Should Correctly Serialize and Deserialize Object' : function(test) {
    var doc = {doc: {age: 42, name: 'Spongebob', shoe_size: 9.5}};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    test.deepEqual(doc.doc.age, BSONDE.BSON.deserialize(serialized_data).doc.age);
    test.deepEqual(doc.doc.name, BSONDE.BSON.deserialize(serialized_data).doc.name);
    test.deepEqual(doc.doc.shoe_size, BSONDE.BSON.deserialize(serialized_data).doc.shoe_size);
    test.done();        
  },
  
  'Should Correctly Serialize and Deserialize Array' : function(test) {
    var doc = {doc: [1, 2, 'a', 'b']};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var deserialized = BSONDE.BSON.deserialize(serialized_data);  
    test.equal(doc.doc[0], deserialized.doc[0])
    test.equal(doc.doc[1], deserialized.doc[1])
    test.equal(doc.doc[2], deserialized.doc[2])
    test.equal(doc.doc[3], deserialized.doc[3])
    test.done();        
  },
  
  'Should Correctly Serialize and Deserialize Array with added on functions' : function(test) {
    Array.prototype.toXml = function() {};
    var doc = {doc: [1, 2, 'a', 'b']};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var deserialized = BSONDE.BSON.deserialize(serialized_data);  
    test.equal(doc.doc[0], deserialized.doc[0])
    test.equal(doc.doc[1], deserialized.doc[1])
    test.equal(doc.doc[2], deserialized.doc[2])
    test.equal(doc.doc[3], deserialized.doc[3])
    test.done();        
  },
  
  'Should correctly deserialize a nested object' : function(test) {
    var doc = {doc: {doc:1}};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    test.deepEqual(doc.doc.doc, BSONDE.BSON.deserialize(serialized_data).doc.doc);
    test.done();            
  },
  
  'Should Correctly Serialize and Deserialize A Boolean' : function(test) {
    var doc = {doc: true};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    test.equal(doc.doc, BSONDE.BSON.deserialize(serialized_data).doc);    
    test.done();        
  },
  
  'Should Correctly Serialize and Deserialize a Date' : function(test) {
    var date = new Date();
    //(2009, 11, 12, 12, 00, 30)
    date.setUTCDate(12);
    date.setUTCFullYear(2009);
    date.setUTCMonth(11 - 1);
    date.setUTCHours(12);
    date.setUTCMinutes(0);
    date.setUTCSeconds(30);
    var doc = {doc: date};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    test.equal(doc.date, BSONDE.BSON.deserialize(serialized_data).doc.date);
    test.done();        
  },
  
  'Should Correctly Serialize nested doc' : function(test) {
    var doc = {
      string: "Strings are great",
      decimal: 3.14159265,
      bool: true,
      integer: 5,
  
      subObject: {
        moreText: "Bacon ipsum dolor.",
        longKeylongKeylongKeylongKeylongKeylongKey: "Pork belly."
      },
  
      subArray: [1,2,3,4,5,6,7,8,9,10],
      anotherString: "another string"
    }
  
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    test.done();
  },
       
  'Should Correctly Serialize and Deserialize Oid' : function(test) {
    var doc = {doc: new BSONSE.ObjectID()};
    var doc2 = {doc: BSONDE.ObjectID.createFromHexString(doc.doc.toHexString())};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    test.deepEqual(doc, BSONDE.BSON.deserialize(serialized_data));
    test.done();        
  },
      
  'Should Correctly encode Empty Hash' : function(test) {
    var doc = {};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    test.deepEqual(doc, BSONDE.BSON.deserialize(serialized_data));
    test.done();        
  },
  
  'Should Correctly Serialize and Deserialize Ordered Hash' : function(test) {
    var doc = {doc: {b:1, a:2, c:3, d:4}};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var decoded_hash = BSONDE.BSON.deserialize(serialized_data).doc;
    var keys = [];
  
    for(var name in decoded_hash) keys.push(name);
    test.deepEqual(['b', 'a', 'c', 'd'], keys);
    test.done();        
  },
  
  'Should Correctly Serialize and Deserialize Regular Expression' : function(test) {
    // Serialize the regular expression
    var doc = {doc: /foobar/mi};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var doc2 = BSONDE.BSON.deserialize(serialized_data);
  
    test.deepEqual(doc.doc.toString(), doc2.doc.toString());
    test.done();        
  },
  
  'Should Correctly Serialize and Deserialize a Binary object' : function(test) {
    var bin = new Binary();
    var string = 'binstring';
    for(var index = 0; index < string.length; index++) {
      bin.put(string.charAt(index));
    }
    var doc = {doc: bin};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
      
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
      
    var deserialized_data = BSONDE.BSON.deserialize(serialized_data);
    test.deepEqual(doc.doc.value(), deserialized_data.doc.value());
    test.done();        
  },
  
  'Should Correctly Serialize and Deserialize a big Binary object' : function(test) {
    var data = fs.readFileSync("test/gridstore/test_gs_weird_bug.png", 'binary');
    var bin = new Binary();
    bin.write(data);
    var doc = {doc: bin};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var deserialized_data = BSONDE.BSON.deserialize(serialized_data);
    test.deepEqual(doc.doc.value(), deserialized_data.doc.value());
    test.done();        
  },
  
  "Should Correctly Serialize and Deserialize DBRef" : function(test) {
    var oid = new ObjectID();
    var doc = {dbref: new DBRef('namespace', oid, null)};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var doc2 = BSONDE.BSON.deserialize(serialized_data);    
    test.equal("namespace", doc2.dbref.namespace);
    test.deepEqual(doc2.dbref.oid.toHexString(), oid.toHexString());
    test.done();        
  },
  
  'Should Correctly Serialize and Deserialize partial DBRef' : function(test) {
    var id = new ObjectID();
    var doc = {'name':'something', 'user':{'$ref':'username', '$id': id}};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var doc2 = BSONDE.BSON.deserialize(serialized_data);
    test.equal('something', doc2.name);
    test.equal('username', doc2.user.namespace);
    test.equal(id.toString(), doc2.user.oid.toString());
    test.done();                
  },
  
  'Should Correctly Serialize and Deserialize simple Int' : function(test) {
    var doc = {doc:2147483648};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var doc2 = BSONDE.BSON.deserialize(serialized_data);
    test.deepEqual(doc.doc, doc2.doc)
    test.done();
  },
  
  'Should Correctly Serialize and Deserialize Long Integer' : function(test) {
    var doc = {doc: Long.fromNumber(9223372036854775807)};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var deserialized_data = BSONDE.BSON.deserialize(serialized_data);
    test.deepEqual(doc.doc, deserialized_data.doc);
    
    doc = {doc: Long.fromNumber(-9223372036854775)};
    serialized_data = BSONSE.BSON.serialize(doc, false, true);
    deserialized_data = BSONDE.BSON.deserialize(serialized_data);
    test.deepEqual(doc.doc, deserialized_data.doc);
    
    doc = {doc: Long.fromNumber(-9223372036854775809)};
    serialized_data = BSONSE.BSON.serialize(doc, false, true);
    deserialized_data = BSONDE.BSON.deserialize(serialized_data);
    test.deepEqual(doc.doc, deserialized_data.doc);
    test.done();        
  },  
  
  'Should Deserialize Large Integers as Number not Long' : function(test) {
    function roundTrip(val) {
      var doc = {doc: val};
      var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
      var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
      BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
      assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
      var deserialized_data = BSONDE.BSON.deserialize(serialized_data);
      test.deepEqual(doc.doc, deserialized_data.doc);
    };
  
    roundTrip(Math.pow(2,52));
    roundTrip(Math.pow(2,53) - 1);
    roundTrip(Math.pow(2,53));
    roundTrip(-Math.pow(2,52));
    roundTrip(-Math.pow(2,53) + 1);
    roundTrip(-Math.pow(2,53));
    roundTrip(Math.pow(2,65));  // Too big for Long.
    roundTrip(-Math.pow(2,65));
    roundTrip(9223372036854775807);
    roundTrip(1234567890123456800);  // Bigger than 2^53, stays a double.
    roundTrip(-1234567890123456800);
    test.done();
  },  
  
  // 'Should Deserialize Larger Integers as Long not Number' : function(test) {
  //   function roundTrip(val) {
  //     var doc = {doc: val};
  //     var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  //     
  //     var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
  //     BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
  //     assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  //       
  //     var deserialized_data = BSONDE.BSON.deserialize(serialized_data);
  //     test.deepEqual(doc.doc, deserialized_data.doc);
  //   };
  //   
  //   var long1 = require('../../lib/mongodb').pure().Long.fromNumber(Math.pow(2,53))
  //     .add(require('../../lib/mongodb').pure().Long.ONE);
  //   var long2 = require('../../lib/mongodb').pure().Long.fromNumber(-Math.pow(2,53))
  //     .subtract(require('../../lib/mongodb').pure().Long.ONE);
  // 
  //   roundTrip(long1);
  //   roundTrip(long2);
  //   test.done();
  // },  
    
  'Should Correctly Serialize and Deserialize Long Integer and Timestamp as different types' : function(test) {
    var long = Long.fromNumber(9223372036854775807);
    var timestamp = Timestamp.fromNumber(9223372036854775807);
    test.ok(long instanceof Long);
    test.ok(!(long instanceof Timestamp));
    test.ok(timestamp instanceof Timestamp);
    test.ok(!(timestamp instanceof Long));
    
    var test_int = {doc: long, doc2: timestamp};
    var serialized_data = BSONSE.BSON.serialize(test_int, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(test_int));
    BSONSE.BSON.serializeWithBufferAndIndex(test_int, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var deserialized_data = BSONDE.BSON.deserialize(serialized_data);  
    test.deepEqual(test_int.doc, deserialized_data.doc);
    test.done();        
  },
  
  'Should Always put the id as the first item in a hash' : function(test) {
    var hash = {doc: {not_id:1, '_id':2}};
    var serialized_data = BSONSE.BSON.serialize(hash, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(hash));
    BSONSE.BSON.serializeWithBufferAndIndex(hash, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var deserialized_data = BSONDE.BSON.deserialize(serialized_data);
    var keys = [];
  
    for(var name in deserialized_data.doc) {
      keys.push(name);
    }
    
    test.deepEqual(['not_id', '_id'], keys);
    test.done();        
  },
  
  'Should Correctly Serialize and Deserialize a User defined Binary object' : function(test) {
    var bin = new Binary();
    bin.sub_type = BSON.BSON_BINARY_SUBTYPE_USER_DEFINED;
    var string = 'binstring';
    for(var index = 0; index < string.length; index++) {
      bin.put(string.charAt(index));
    }
  
    var doc = {doc: bin};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
    var deserialized_data = BSONDE.BSON.deserialize(serialized_data);
    
    test.deepEqual(deserialized_data.doc.sub_type, BSON.BSON_BINARY_SUBTYPE_USER_DEFINED);
    test.deepEqual(doc.doc.value(), deserialized_data.doc.value());
    test.done();        
  },
  
  'Should Correclty Serialize and Deserialize a Code object'  : function(test) {
    var doc = {'doc': {'doc2': new BSONSE.Code('this.a > i', {i:1})}};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var deserialized_data = BSONDE.BSON.deserialize(serialized_data);    
    test.deepEqual(doc.doc.doc2.code, deserialized_data.doc.doc2.code);
    test.deepEqual(doc.doc.doc2.scope.i, deserialized_data.doc.doc2.scope.i);
    test.done();        
  },
  
  'Should Correctly serialize and deserialize and embedded array' : function(test) {
    var doc = {'a':0,
      'b':['tmp1', 'tmp2', 'tmp3', 'tmp4', 'tmp5', 'tmp6', 'tmp7', 'tmp8', 'tmp9', 'tmp10', 'tmp11', 'tmp12', 'tmp13', 'tmp14', 'tmp15', 'tmp16']
    };
  
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var deserialized_data = BSONDE.BSON.deserialize(serialized_data);    
    test.deepEqual(doc.a, deserialized_data.a);
    test.deepEqual(doc.b, deserialized_data.b);
    test.done();        
  },  
  
  'Should Correctly Serialize and Deserialize UTF8' : function(test) {
    // Serialize utf8
    var doc = { "name" : "本荘由利地域に洪水警報", "name1" : "öüóőúéáűíÖÜÓŐÚÉÁŰÍ", "name2" : "abcdedede"};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var deserialized_data = BSONDE.BSON.deserialize(serialized_data);
    test.deepEqual(doc, deserialized_data);
    test.done();
  },
  
  'Should Correctly Serialize and Deserialize query object' : function(test) {
    var doc = { count: 'remove_with_no_callback_bug_test', query: {}, fields: null};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var deserialized_data = BSONDE.BSON.deserialize(serialized_data);    
    test.deepEqual(doc, deserialized_data);
    test.done();
  },
  
  'Should Correctly Serialize and Deserialize empty query object' : function(test) {
    var doc = {};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var deserialized_data = BSONDE.BSON.deserialize(serialized_data);
    test.deepEqual(doc, deserialized_data);
    test.done();
  },
  
  'Should Correctly Serialize and Deserialize array based doc' : function(test) {
    var doc = { b: [ 1, 2, 3 ], _id: new BSONSE.ObjectID() };
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var deserialized_data = BSONDE.BSON.deserialize(serialized_data);
    test.deepEqual(doc.b, deserialized_data.b)
    test.deepEqual(doc, deserialized_data);
    test.done();
  },
  
  'Should Correctly Serialize and Deserialize Symbol' : function(test) {
    if(Symbol != null) {
      var doc = { b: [ new Symbol('test') ]};
      var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
      var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
      BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
      assertBuffersEqual(test, serialized_data, serialized_data2, 0);
          
      var deserialized_data = BSONDE.BSON.deserialize(serialized_data);
      test.deepEqual(doc.b, deserialized_data.b)
      test.deepEqual(doc, deserialized_data);
      test.ok(deserialized_data.b[0] instanceof Symbol);
    }
    
    test.done();
  },
  
  'Should handle Deeply nested document' : function(test) {
    var doc = {a:{b:{c:{d:2}}}};
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var deserialized_data = BSONDE.BSON.deserialize(serialized_data);    
    test.deepEqual(doc, deserialized_data);
    test.done();
  },
  
  'Should handle complicated all typed object' : function(test) {
    // First doc
    var date = new Date();
    var oid = new BSONSE.ObjectID();
    var string = 'binstring'
    var bin = new BSONSE.Binary()
    for(var index = 0; index < string.length; index++) {
      bin.put(string.charAt(index))
    }
  
    var doc = {
      'string': 'hello',
      'array': [1,2,3],
      'hash': {'a':1, 'b':2},
      'date': date,
      'oid': oid,
      'binary': bin,
      'int': 42,
      'float': 33.3333,
      'regexp': /regexp/,
      'boolean': true,
      'long': date.getTime(),
      'where': new BSONSE.Code('this.a > i', {i:1}),
      'dbref': new BSONSE.DBRef('namespace', oid, 'integration_tests_')
    }
  
    // Second doc
    var oid = new BSONDE.ObjectID.createFromHexString(oid.toHexString());
    var string = 'binstring'
    var bin = new BSONDE.Binary()
    for(var index = 0; index < string.length; index++) {
      bin.put(string.charAt(index))
    }
  
    var doc2 = {
      'string': 'hello',
      'array': [1,2,3],
      'hash': {'a':1, 'b':2},
      'date': date,
      'oid': oid,
      'binary': bin,
      'int': 42,
      'float': 33.3333,
      'regexp': /regexp/,
      'boolean': true,
      'long': date.getTime(),
      'where': new BSONDE.Code('this.a > i', {i:1}),
      'dbref': new BSONDE.DBRef('namespace', oid, 'integration_tests_')
    }
  
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var serialized_data2 = BSONDE.BSON.serialize(doc2, false, true);
  
    for(var i = 0; i < serialized_data2.length; i++) {
      require('assert').equal(serialized_data2[i], serialized_data[i])      
    }
  
    test.done();    
  },
  
  'Should Correctly Serialize Complex Nested Object' : function(test) {
    var doc = { email: 'email@email.com',
          encrypted_password: 'password',
          friends: [ '4db96b973d01205364000006',
             '4dc77b24c5ba38be14000002' ],
          location: [ 72.4930088, 23.0431957 ],
          name: 'Amit Kumar',
          password_salt: 'salty',
          profile_fields: [],
          username: 'amit',
          _id: new BSONSE.ObjectID() }
          
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
    
    var doc2 = doc;
    doc2._id = BSONDE.ObjectID.createFromHexString(doc2._id.toHexString());
    var serialized_data2 = BSONDE.BSON.serialize(doc2, false, true);
  
    for(var i = 0; i < serialized_data2.length; i++) {
      require('assert').equal(serialized_data2[i], serialized_data[i])      
    }
  
    test.done();
  },
  
  'Should correctly massive doc' : function(test) {
    var oid1 = new BSONSE.ObjectID();
    var oid2 = new BSONSE.ObjectID();
  
    // JS doc
    var doc = { dbref2: new BSONSE.DBRef('namespace', oid1, 'integration_tests_'),
         _id: oid2 };
  
    var doc2 = { dbref2: new BSONDE.DBRef('namespace', BSONDE.ObjectID.createFromHexString(oid1.toHexString()), 'integration_tests_'),
        _id: new BSONDE.ObjectID.createFromHexString(oid2.toHexString()) };
  
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var serialized_data2 = BSONDE.BSON.serialize(doc2, false, true);
    test.done();
  },
  
  'Should Correctly Serialize/Deserialize regexp object' : function(test) {
    var doc = {'b':/foobaré/};
  
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var serialized_data2 = BSONDE.BSON.serialize(doc, false, true);
  
    for(var i = 0; i < serialized_data2.length; i++) {
      require('assert').equal(serialized_data2[i], serialized_data[i])      
    }
  
    test.done();
  },
  
  'Should Correctly Serialize/Deserialize complicated object' : function(test) {
    var doc = {a:{b:{c:[new BSONSE.ObjectID(), new BSONSE.ObjectID()]}}, d:{f:1332.3323}};
  
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var doc2 = BSONSE.BSON.deserialize(serialized_data);
  
    test.deepEqual(doc, doc2)
    test.done();
  },
  
  'Should Correctly Serialize/Deserialize nested object' : function(test) {
    var doc = { "_id" : { "date" : new Date(), "gid" : "6f35f74d2bea814e21000000" }, 
      "value" : { 
            "b" : { "countries" : { "--" : 386 }, "total" : 1599 }, 
            "bc" : { "countries" : { "--" : 3 }, "total" : 10 }, 
            "gp" : { "countries" : { "--" : 2 }, "total" : 13 }, 
            "mgc" : { "countries" : { "--" : 2 }, "total" : 14 } 
          }
      }
  
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var doc2 = BSONSE.BSON.deserialize(serialized_data);
  
    test.deepEqual(doc, doc2)
    test.done();
  },
  
  'Should Correctly Serialize/Deserialize nested object with even more nesting' : function(test) {
    var doc = { "_id" : { "date" : {a:1, b:2, c:new Date()}, "gid" : "6f35f74d2bea814e21000000" }, 
      "value" : { 
            "b" : { "countries" : { "--" : 386 }, "total" : 1599 }, 
            "bc" : { "countries" : { "--" : 3 }, "total" : 10 }, 
            "gp" : { "countries" : { "--" : 2 }, "total" : 13 }, 
            "mgc" : { "countries" : { "--" : 2 }, "total" : 14 } 
          }
      }
  
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
    var doc2 = BSONSE.BSON.deserialize(serialized_data);
    test.deepEqual(doc, doc2)
    test.done();
  },
  
  'Should Correctly Deserialize Object with empty field' : function(test) {
    var data = "4e140000fcdbb4530c000000010000000800000000000000000000000000000021000000f1000000025f69640011000000396537336265313539326162326463660010636f696e00962b000003636f6d6d756e6974790019000000106578700023000000106c6576656c00030000000003636f6f6b696e67001900000010657870001e000000106c6576656c0004000000000367617264656e001900000010657870000f070000106c6576656c0012000000000368656c700034000000026461796b6579000900000032303131303531370010656d696c7900030000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d650061411b40310100001076616c75650015000000000079000000025f69640011000000356166383862316638656463613164620003636f6d6d756e697479000e0000001065787000040000"
      + "00000368656c7000140000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d65009d1a954e2f0100001076616c75650001000000000080000000025f69640011000000656338336630313832623732646438350010636f696e00900100000367617264656e000e000000106578700002000000000368656c7000140000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d65009656ea502f0100001076616c7565000a00000000004d000000025f6964001b000000706c616e745f66727569745f626c756562657272795f313130340010636f696e00000000000368656c7000140000000176616c7565000000000000004e40000080000000025f69640011000000643338356130623934666266666663340010636f696e00530200000367617264656e000e0000001065787000"
      + "03000000000368656c7000140000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d65009bc90ee32f0100001076616c7565000a0000000000e4000000025f69640011000000653339643962666535633532316532650010636f696e00a223000003636f6d6d756e69747900190000001065787000c60b0000106c6576656c00180000000003636f6f6b696e6700190000001065787000f00b0000106c6576656c0014000000000367617264656e00190000001065787000630c0000106c6576656c0014000000000368656c700027000000106461796b6579006ddd320110656d696c7900000000001076616c7565003b00000000037374616d696e61001e0000001274696d6500c19a4952310100001076616c75650018000000000060000000025f6964001100000065643230386263376162306530643337000"
      + "368656c7000140000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d65008954c6702f0100001076616c7565000a0000000000b0000000025f69640011000000353266366664646566303061613139310010636f696e002601000003636f6d6d756e697479000e000000106578700003000000000367617264656e000e000000106578700002000000000368656c70002b000000106461796b65790058dc320110656d696c7900020000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d6500e7d9614b300100001076616c7565000a0000000000ac000000025f69640011000000613165366438316365646163366133610010636f696e005c00000003636f6d6d756e697479000e000000106578700006000000000367617264656e000e0000001065787000030000000003"
      + "68656c700027000000106461796b65790070dd320110656d696c7900030000001076616c7565003a00000000037374616d696e61001e0000001274696d6500cb746cf6300100001076616c7565000a0000000000d9000000025f69640011000000326463373037393536393539646639390010636f696e006e04000003636f6d6d756e697479000e0000001065787000060000000003636f6f6b696e670019000000106578700005000000106c6576656c0002000000000367617264656e001900000010657870000a000000106c6576656c0002000000000368656c700027000000106461796b65790070dd320110656d696c7900000000001076616c7565003900000000037374616d696e61001e0000001274696d6500a08616f3300100001076616c7565000b000000000060000000025f6964001100000066383166313031323066373438646536"
      + "000368656c7000140000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d650058fa44f4300100001076616c75650007000000000080000000025f69640011000000363939383335343162633934663634610010636f696e00c80000000367617264656e000e000000106578700001000000000368656c7000140000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d6500e0eaa9e12f0100001076616c7565000a000000000046000000025f696400110000003534383633333935336138353336613900037374616d696e61001e0000001274696d650080143e92300100001076616c7565000a0000000000d9000000025f69640011000000366138623635636536353836386161390010636f696e00cb19000003636f6d6d756e697479001900000010657870001c0000001"
      + "06c6576656c00020000000003636f6f6b696e670019000000106578700005000000106c6576656c0002000000000367617264656e001900000010657870003c000000106c6576656c0005000000000368656c70001c000000106461796b65790082dd32011076616c7565003900000000037374616d696e61001e0000001274696d6500dc37cef3300100001076616c7565000e0000000000ac000000025f69640011000000363538373534666631356666653132340010636f696e000603000003636f6d6d756e697479000e000000106578700002000000000367617264656e000e000000106578700003000000000368656c700027000000106461796b6579006ddd320110656d696c7900010000001076616c7565003b00000000037374616d696e61001e0000001274696d6500375f55e5300100001076616c7565000a0000000000b000000002"
      + "5f69640011000000653835363766313762323363663562320010636f696e005f02000003636f6d6d756e697479000e000000106578700003000000000367617264656e000e000000106578700004000000000368656c70002b000000106461796b657900b0dc320110656d696c7900030000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d6500abeb1fe72f0100001076616c7565000a0000000000b0000000025f69640011000000313737393430343136336639353937610010636f696e005f02000003636f6d6d756e697479000e000000106578700003000000000367617264656e000e000000106578700004000000000368656c70002b000000106461796b657900b0dc320110656d696c7900030000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d65006b3cdde2"
      + "2f0100001076616c756500040000000000b0000000025f69640011000000333964303239613962353464646638370010636f696e001003000003636f6d6d756e697479000e000000106578700003000000000367617264656e000e000000106578700003000000000368656c70002b000000106461796b657900b0dc320110656d696c7900030000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d65007220e3e22f0100001076616c756500050000000000a2000000025f69640011000000346634303936346432393839616537660010636f696e005302000003636f6f6b696e670019000000106578700008000000106c6576656c0002000000000367617264656e000e000000106578700004000000000368656c7000140000000176616c7565000000000000004e4000037374616d696e61001e000000127"
      + "4696d650007e669f62f0100001076616c7565000a0000000000b0000000025f69640011000000643962353036353061643161376163630010636f696e00b702000003636f6d6d756e697479000e000000106578700003000000000367617264656e000e000000106578700003000000000368656c70002b000000106461796b657900b0dc320110656d696c7900030000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d650067bb69f62f0100001076616c7565000a0000000000c7000000025f69640011000000643931373737366361653533666564650010636f696e00bf01000003636f6d6d756e697479000e0000001065787000030000000003636f6f6b696e67000e000000106578700004000000000367617264656e000e000000106578700004000000000368656c70002b000000106461796b657900"
      + "b0dc320110656d696c7900030000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d65008a18b35e310100001076616c756500090000000000b0000000025f69640011000000646531386165633930646662313265380010636f696e005e02000003636f6d6d756e697479000e000000106578700003000000000367617264656e000e000000106578700004000000000368656c70002b000000106461796b657900b0dc320110656d696c7900030000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d65006abb4fe32f0100001076616c7565000a0000000000b0000000025f69640011000000386465313061383266656333333532370010636f696e000703000003636f6d6d756e697479000e000000106578700006000000000367617264656e000e000000106578700003"
      + "000000000368656c70002b000000106461796b65790015dd320110656d696c7900000000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d65002309ec86300100001076616c7565000a000000000080000000025f69640011000000366462643730643466383933383637310010636f696e00640000000367617264656e000e000000106578700001000000000368656c7000140000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d650084bee487300100001076616c756500060000000000b0000000025f69640011000000346631613964643131336138633939310010636f696e001e03000003636f6d6d756e697479000e000000106578700003000000000367617264656e000e000000106578700003000000000368656c70002b000000106461796b657900b4dc320"
      + "110656d696c7900030000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d6500f98cad5e310100001076616c7565000a000000000060000000025f6964001100000030353534323432356461396539373832000368656c7000140000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d6500c08d6cf62f0100001076616c7565000a000000000060000000025f6964001100000032626162346666633262383333373532000368656c7000140000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d650000dd40fc2f0100001076616c7565000a0000000000740000000a5f69640010636f696e008601000003636f6f6b696e67000e000000106578700003000000000367617264656e000e00000010657870000a000000000368656c7000"
      + "140000000176616c7565000000000000004e4000037374616d696e6100100000001076616c7565000c0000000000b4000000025f69640011000000666433393432353639643235613865620010636f696e005702000003636f6d6d756e697479000e000000106578700002000000000367617264656e000e000000106578700003000000000368656c70002f000000106461796b65790015dd320101656d696c7900000000000000f87f0176616c7565000000000000004e4000037374616d696e61001e0000001274696d6500afbaec86300100001076616c7565000a0000000000b4000000025f69640011000000336165316238633765393032396564620010636f696e005702000003636f6d6d756e697479000e000000106578700002000000000367617264656e000e000000106578700003000000000368656c70002f000000106461796b6579"
      + "0015dd320101656d696c7900000000000000f87f0176616c7565000000000000004e4000037374616d696e61001e0000001274696d65007e01d287300100001076616c7565000a0000000000bb000000025f69640011000000613832373939623035376337623061380010636f696e009401000003636f6d6d756e697479000e000000106578700003000000000367617264656e001900000010657870000a000000106c6576656c0002000000000368656c70002b000000106461796b65790015dd320110656d696c7900000000000176616c7565000000000000004e4000037374616d696e61001e0000001274696d65004124da87300100001076616c75650006000000000066000000025f69640011000000313433363231653932366130346434390010636f696e00640000000367617264656e000e00000010657870000100000000037374616"
      + "d696e61001e0000001274696d650015ff7cb6300100001076616c7565000a0000000000d9000000025f69640011000000346263316165363465356436666130630010636f696e004c03000003636f6d6d756e697479000e0000001065787000030000000003636f6f6b696e670019000000106578700005000000106c6576656c0002000000000367617264656e001900000010657870000a000000106c6576656c0002000000000368656c700027000000106461796b65790070dd320110656d696c7900000000001076616c7565003900000000037374616d696e61001e0000001274696d6500f94786f4300100001076616c7565000a0000000000";
    var binaryData = new Buffer(hexStringToBinary(data));    
    var doc2 = BSONSE.BSON.deserialize(binaryData);
    test.equal('4bc1ae64e5d6fa0c', doc2._id);
    test.done()    
  },
    
  'Should Correctly handle Forced Doubles to ensure we allocate enough space for cap collections' : function(test) {
    if(Double != null) {
      var doubleValue = new Double(100);
      var doc = {value:doubleValue};
  
      // Serialize
      var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  
      var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
      BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
      assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  
      var doc2 = BSONSE.BSON.deserialize(serialized_data);
      test.deepEqual({value:100}, doc2);
    }    
  
    test.done();      
  },
  
  'Should Correctly deserialize a message' : function(test) {
    var data = "24000000be00de4428000000010000000800000000000000000000000000000000000000";
    var parent = {bson_deserializer:{"Long":Long, "BSON":BSONSE.BSON}}
    var binaryData = new Buffer(hexStringToBinary(data));    
  
    var doc2 = new MongoReply(parent, binaryData);   
    test.deepEqual([], doc2.documents);
    test.done();
  },
  
  'Should deserialize correctly' : function(test) {
    var doc = {
     "_id" : new ObjectID("4e886e687ff7ef5e00000162"),
     "str" : "foreign",
     "type" : 2,
     "timestamp" : ISODate("2011-10-02T14:00:08.383Z"),
     "links" : [
       "http://www.reddit.com/r/worldnews/comments/kybm0/uk_home_secretary_calls_for_the_scrapping_of_the/"
     ]
    }    
    
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);  
    var doc2 = BSONSE.BSON.deserialize(serialized_data);
  
    test.deepEqual(doc, doc2)
    test.done();    
  },
  
  'Should correctly serialize and deserialize MinKey and MaxKey values' : function(test) {
    var doc = {
        _id : new ObjectID("4e886e687ff7ef5e00000162"),
        minKey : new MinKey(),
        maxKey : new MaxKey()
      }
    
    var serialized_data = BSONSE.BSON.serialize(doc, false, true);  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);  
    var doc2 = BSONSE.BSON.deserialize(serialized_data);
  
    test.deepEqual(doc, doc2)
    test.ok(doc2.minKey instanceof MinKey);
    test.ok(doc2.maxKey instanceof MaxKey);
    test.done();
  },
  
  'Should correctly serialize Double value' : function(test) {
    var doc = {
        value : new Double(34343.2222)
      }

    var serialized_data = BSONSE.BSON.serialize(doc, false, true);  
    var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
    BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
    assertBuffersEqual(test, serialized_data, serialized_data2, 0);  
    var doc2 = BSONSE.BSON.deserialize(serialized_data);

    test.ok(doc.value.valueOf(), doc2.value);
    test.ok(doc.value.value, doc2.value);
    test.done();    
  },
  
  'ObjectID should correctly create objects' : function(test) {
    try {
      var object1 = ObjectID.createFromHexString('000000000000000000000001')
      var object2 = ObjectID.createFromHexString('00000000000000000000001')      
      test.ok(false);
    } catch(err) {
      test.ok(err != null);
    }
    
    test.done();
  },
  
  // 'Should Correctly Function' : function(test) {
  //   var doc = {b:1, func:function() {
  //     this.b = 2;
  //   }};
  //     
  //   var serialized_data = BSONSE.BSON.serialize(doc, false, true);
  //   
  //   debug("----------------------------------------------------------------------")
  //   debug(inspect(serialized_data))
  //     
  //   // var serialized_data2 = new Buffer(BSONSE.BSON.calculateObjectSize(doc));
  //   // BSONSE.BSON.serializeWithBufferAndIndex(doc, false, serialized_data2, 0);    
  //   // assertBuffersEqual(test, serialized_data, serialized_data2, 0);
  //   var COUNT = 100000;
  //     
  //   // var b = null;
  //   // eval("b = function(x) { return x+x; }");
  //   // var b = new Function("x", "return x+x;");
  //     
  //   console.log(COUNT + "x (objectBSON = BSON.serialize(object))")
  //   start = new Date
  //   
  //   for (i=COUNT; --i>=0; ) {
  //     var doc2 = BSONSE.BSON.deserialize(serialized_data, {evalFunctions: true, cacheFunctions:true});
  //   }
  //     
  //   end = new Date
  //   console.log("time = ", end - start, "ms -", COUNT * 1000 / (end - start), " ops/sec")
  //     
  //   // debug(inspect(BSONSE.BSON.functionCache))
  //   //   
  //   // var doc2 = BSONSE.BSON.deserialize(serialized_data, {evalFunctions: true, cacheFunctions:true});
  //   // // test.deepEqual(doc, doc2)
  //   // // 
  //   // debug(inspect(doc2))
  //   // doc2.func()
  //   // debug(inspect(doc2))
  //   // 
  //   // var serialized_data = BSONSE.BSON.serialize(doc2, false, true);
  //   // var doc3 = BSONSE.BSON.deserialize(serialized_data, {evalFunctions: true, cacheFunctions:true});
  //   // 
  //   // debug("-----------------------------------------------")
  //   // debug(inspect(doc3))
  //   
  //   // var key = "0"
  //   // for(var i = 1; i < 10000; i++) {
  //   //   key = key + " " + i
  //   // }
  //   
  //   test.done();
  //   
  //   
  //   // var car = {
  //   //   model : "Volvo",
  //   //   country : "Sweden",
  //   //   
  //   //   isSwedish : function() {
  //   //     return this.country == "Sweden";
  //   //   }
  //   // }
  //   
  // },
  
  noGlobalsLeaked : function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }  
});

// Assign out tests
module.exports = tests;