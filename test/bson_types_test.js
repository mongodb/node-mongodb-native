var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();

var testCase = require('../deps/nodeunit').testCase,
  Buffer = require('buffer').Buffer,
  gleak = require('../dev/tools/gleak'),
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

var hexStringToBinary = function(string) {
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

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  callback();
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.tearDown = function(callback) {
  callback();
}
  
/**
 * A simple example showing the usage of the binary put method.
 *
 * @_class binary
 * @_function put
 * @ignore
 */
exports.shouldCorrectUsePutForBinaryType = function(test) {
  // Create an empty Binary object
  var binary = new Binary(new Buffer(''), BSON.BSON_BINARY_SUBTYPE_DEFAULT);
  // Write some character to the Binary value
  binary.put('h');
  binary.put('e');
  binary.put('l');
  binary.put('l');
  binary.put('o');
  // Validate the content of the binary
  test.equal('hello', binary.toString('ascii'));
  test.done();
}

/**
 * A simple example showing the usage of the binary write method.
 *
 * @_class binary
 * @_function write
 * @ignore
 */
exports.shouldCorrectUseWriteForBinaryType = function(test) {
  // Create an empty Binary object
  var binary = new Binary(new Buffer(''), BSON.BSON_BINARY_SUBTYPE_DEFAULT);
  // Write some data to the binary
  binary.write('hello', 0);
  // Validate the content of the binary
  test.equal('hello', binary.toString('ascii'));
  test.done();
}

/**
 * A simple example showing the usage of the binary read method.
 *
 * @_class binary
 * @_function read
 * @ignore
 */
exports.shouldCorrectUseReadForBinaryType = function(test) {
  // Create an empty Binary object
  var binary = new Binary(new Buffer(''), BSON.BSON_BINARY_SUBTYPE_DEFAULT);
  // Write some data to the binary
  binary.write('hello', 0);
  // Read a couple of characters from the binary
  var data = binary.read(1, 2);
  // Validate the content of the binary
  test.equal('el', data.toString('ascii'));
  test.done();
}

/**
 * A simple example showing the usage of the binary value method.
 *
 * @_class binary
 * @_function value
 * @ignore
 */
exports.shouldCorrectUseValueForBinaryType = function(test) {
  // Create an empty Binary object
  var binary = new Binary(new Buffer(''), BSON.BSON_BINARY_SUBTYPE_DEFAULT);
  // Write some data to the binary
  binary.write('hello', 0);
  // Validate the content of the binary
  test.equal('hello', binary.value());
  test.done();
}

/**
 * A simple example showing the usage of the binary length method.
 *
 * @_class binary
 * @_function length
 * @ignore
 */
exports.shouldCorrectUseLengthForBinaryType = function(test) {
  // Create an empty Binary object
  var binary = new Binary(new Buffer(''), BSON.BSON_BINARY_SUBTYPE_DEFAULT);
  // Write some data to the binary
  binary.write('hello');
  // Validate the content of the binary
  test.equal(5, binary.length());
  test.done();
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.noGlobalsLeaked = function(test) {
  var leaks = gleak.detectNew();
  test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
  test.done();
}