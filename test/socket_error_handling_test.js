var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();

var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  Buffer = require('buffer').Buffer,
  gleak = require('../tools/gleak'),
  net = require('net'),
  fs = require('fs'),
  Db = mongodb.Db,
  Server = mongodb.Server,
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
  Connection = mongodb.Connection,
  BinaryParser = mongodb.BinaryParser,
  binary_utils = require('../lib/mongodb/bson/binary_utils');

var BSONSE = mongodb,
  BSONDE = mongodb;

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

var tests = testCase({
  setUp: function(callback) {
    callback();        
  },
  
  tearDown: function(callback) {
    callback();
  },

  'Should connect to dummy socket delivering garbage messages that should force error to be emitted' : function(test) {
    // // Set up tcp server connection to listen
    // var server = net.createServer(function(socket) {
    //   socket.on("connect", function(data) {
    //   });
    // 
    //   socket.on("data", function(data) {
    //     var buffer = new Buffer(20);
    //     binary_utils.encodeIntInPlace(-1222, buffer, 0);
    //     socket.write(buffer, 'binary');
    //   });
    // });
    // 
    // // Logger
    // var logger = {
    //   error : function(message, err) {
    //     test.equal("connectionError", message);
    //     test.equal("unparsable", err.err)
    //     test.equal(-1222, err.parseState.sizeOfMessage)        
    //   },
    //   
    //   log : function() {},
    //   debug : function() {}
    // }
    // 
    // // Start server
    // server.listen(27034, 'localhost', function() {
    //   // Server is up, let's try to "connect" so we fail
    //   var db = new Db('error_tests', new Server('localhost', 27034, {auto_reconnect: true}), {native_parser: false, logger:logger});
    //   // Check that we get an error as expected
    //   db.open(function(err, _db) {
    //     test.equal("unparsable", err.err)
    //     test.equal(-1222, err.parseState.sizeOfMessage)
    //     
    //     db.open(function(err, _db) {
    //       test.equal("unparsable", err.err)
    //       test.equal(-1222, err.parseState.sizeOfMessage)
    //       
    //       // Close server
    //       server.close();
    //       // Test is done
    //       test.done();
    //     })
    //   });        
    // });        
    test.done();
  },
  
  noGlobalsLeaked : function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }
});

// Assign out tests
module.exports = tests;
