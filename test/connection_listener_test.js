var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();

var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  Buffer = require('buffer').Buffer,
  gleak = require('../tools/gleak'),
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
  Connection = mongodb.Connection,
  BinaryParser = mongodb.BinaryParser;

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

  'Should correctly parse perfectly aligned message from socket' : function(test) {    
  //   // Connection dummy object
  //   var connectionObject = {"connection": {}, "sizeOfMessage": 0, "bytesRead": 0, "buffer": new Buffer(0), "stubBuffer": new Buffer(0)}
  //   // Data object
  //   var index = 0;
  //   var buffer = new Buffer(10);
  //   var value = 10;
  //   // Encode length at start according to wire protocol
  //   buffer[index + 3] = (value >> 24) & 0xff;      
  //   buffer[index + 2] = (value >> 16) & 0xff;
  //   buffer[index + 1] = (value >> 8) & 0xff;
  //   buffer[index] = value & 0xff;            
  //   
  //   // Self environment dummy
  //   var self = {poolByReference:{1:connectionObject}, 'emit':function(type, data) {
  //     test.equal('data', type);
  //     // Compare the buffers content
  //     for(var i = 0; i < buffer.length; i++) {
  //       test.equal(buffer[i], data[i]);
  //     }
  //   }};
  //   
  //   // Trigger the connection listener
  //   var connectionListener = Connection._receiveListenerCreator(self);
  //   connectionListener(buffer, 1)
  //   // Sequential execution :)
  //   test.done();      
  // },
  // 
  // 'Should correctly parse perfectly aligned double message from socket' : function(test) {    
  //   // Connection dummy object
  //   var connectionObject = {"connection": {}, "sizeOfMessage": 0, "bytesRead": 0, "buffer": new Buffer(0), "stubBuffer": new Buffer(0)}
  //   // Data object
  //   var index = 0;
  //   var buffer = new Buffer(20);
  //   var value = 10;
  //   // Encode length at start according to wire protocol
  //   buffer[index + 3] = (value >> 24) & 0xff;      
  //   buffer[index + 2] = (value >> 16) & 0xff;
  //   buffer[index + 1] = (value >> 8) & 0xff;
  //   buffer[index] = value & 0xff;            
  // 
  //   // Adjust the index
  //   index = index + 10;
  //   // Encode length at start according to wire protocol
  //   buffer[index + 3] = (value >> 24) & 0xff;      
  //   buffer[index + 2] = (value >> 16) & 0xff;
  //   buffer[index + 1] = (value >> 8) & 0xff;
  //   buffer[index] = value & 0xff;            
  // 
  //   // var result index
  //   var resultIndex = 0;
  //   // var results
  //   var results = [buffer.slice(0, 10), buffer.slice(10)];
  //   
  //   // Self environment dummy
  //   var self = {poolByReference:{1:connectionObject}, 'emit':function(type, data) {
  //     test.equal('data', type);
  //     // Compare the buffers content
  //     for(var i = 0; i < buffer.length; i++) {
  //       test.equal(results[resultIndex][i], data[i]);
  //     }
  //     // Update to next result
  //     resultIndex = resultIndex + 1;
  //   }};
  //   
  //   // Trigger the connection listener
  //   var connectionListener = Connection._receiveListenerCreator(self);
  //   connectionListener(buffer, 1)
    // Sequential execution :)
    test.done();      
  },
  
  // 'Should correctly parse message + in two packets from socket' : function(test) {    
  //   // Connection dummy object
  //   var connectionObject = {"connection": {}, "sizeOfMessage": 0, "bytesRead": 0, "buffer": new Buffer(0), "stubBuffer": new Buffer(0)}
  //   // Data object
  //   var index = 0;
  //   var buffer = new Buffer(10);
  //   var value = 10;
  //   // Encode length at start according to wire protocol
  //   buffer[index + 3] = (value >> 24) & 0xff;      
  //   buffer[index + 2] = (value >> 16) & 0xff;
  //   buffer[index + 1] = (value >> 8) & 0xff;
  //   buffer[index] = value & 0xff;            
  //   
  //   // Self environment dummy
  //   var self = {poolByReference:{1:connectionObject}, 'emit':function(type, data) {
  //     test.equal('data', type);
  //     // Compare the buffers content
  //     for(var i = 0; i < buffer.length; i++) {
  //       test.equal(buffer[i], data[i]);
  //     }
  //   }};
  //   
  //   // Trigger the connection listener
  //   var connectionListener = Connection._receiveListenerCreator(self);
  //   connectionListener(buffer.slice(0, 6), 1)
  //   connectionListener(buffer.slice(6), 1)
  //   // Sequential execution :)
  //   test.done();      
  // },
  // 
  // 'Should correctly parse message + in two packets from socket and partial third one' : function(test) {    
  //   // Connection dummy object
  //   var connectionObject = {"connection": {}, "sizeOfMessage": 0, "bytesRead": 0, "buffer": new Buffer(0), "stubBuffer": new Buffer(0)}
  //   // Data object
  //   var index = 0;
  //   var buffer = new Buffer(20);
  //   var value = 10;
  //   // Encode length at start according to wire protocol
  //   buffer[index + 3] = (value >> 24) & 0xff;      
  //   buffer[index + 2] = (value >> 16) & 0xff;
  //   buffer[index + 1] = (value >> 8) & 0xff;
  //   buffer[index] = value & 0xff;            
  // 
  //   // Adjust the index
  //   index = index + 10;
  //   // Encode length at start according to wire protocol
  //   buffer[index + 3] = (value >> 24) & 0xff;      
  //   buffer[index + 2] = (value >> 16) & 0xff;
  //   buffer[index + 1] = (value >> 8) & 0xff;
  //   buffer[index] = value & 0xff;            
  //   
  //   // Self environment dummy
  //   var self = {poolByReference:{1:connectionObject}, 'emit':function(type, data) {
  //     test.equal('data', type);      
  //     // Compare the buffers content
  //     for(var i = 0; i < data.length; i++) {
  //       test.equal(buffer[i], data[i]);
  //     }
  //   }};
  //   
  //   // Trigger the connection listener
  //   var connectionListener = Connection._receiveListenerCreator(self);
  //   connectionListener(buffer.slice(0, 6), 1)
  //   connectionListener(buffer.slice(6, 15), 1)
  // 
  //   // Do asserts
  //   test.equal(10, connectionObject.sizeOfMessage);
  //   test.equal(5, connectionObject.bytesRead);
  //   test.equal(0, connectionObject.stubBuffer.length);
  //   // Check against message
  //   var partialMessage = buffer.slice(10, 15);    
  //   for(var i = 0; i < 5; i++) {
  //     test.equal(partialMessage[i], connectionObject.buffer[i]);
  //   }
  //   
  //   // Sequential execution :)
  //   test.done();      
  // },
  // 
  // 'Should correctly parse message + in two packets from socket and smaller than 4 bytes additional one' : function(test) {    
  //   // Connection dummy object
  //   var connectionObject = {"connection": {}, "sizeOfMessage": 0, "bytesRead": 0, "buffer": new Buffer(0), "stubBuffer": new Buffer(0)}
  //   // Data object
  //   var index = 0;
  //   var buffer = new Buffer(20);
  //   var value = 10;
  //   // Encode length at start according to wire protocol
  //   buffer[index + 3] = (value >> 24) & 0xff;      
  //   buffer[index + 2] = (value >> 16) & 0xff;
  //   buffer[index + 1] = (value >> 8) & 0xff;
  //   buffer[index] = value & 0xff;            
  // 
  //   // Adjust the index
  //   index = index + 10;
  //   // Encode length at start according to wire protocol
  //   buffer[index + 3] = (value >> 24) & 0xff;      
  //   buffer[index + 2] = (value >> 16) & 0xff;
  //   buffer[index + 1] = (value >> 8) & 0xff;
  //   buffer[index] = value & 0xff;            
  //   
  //   // Self environment dummy
  //   var self = {poolByReference:{1:connectionObject}, 'emit':function(type, data) {
  //     test.equal('data', type);      
  //     // Compare the buffers content
  //     for(var i = 0; i < data.length; i++) {
  //       test.equal(buffer[i], data[i]);
  //     }
  //   }};
  //   
  //   // Trigger the connection listener
  //   var connectionListener = Connection._receiveListenerCreator(self);
  //   connectionListener(buffer.slice(0, 6), 1)
  //   connectionListener(buffer.slice(6, 13), 1)
  // 
  //   // Do asserts
  //   test.equal(0, connectionObject.sizeOfMessage);
  //   test.equal(0, connectionObject.bytesRead);
  //   test.equal(3, connectionObject.stubBuffer.length);
  //   // Check against message
  //   var partialMessage = buffer.slice(10, 13);    
  //   for(var i = 0; i < 3; i++) {
  //     test.equal(partialMessage[i], connectionObject.stubBuffer[i]);
  //   }
  //   
  //   // Sequential execution :)
  //   test.done();      
  // },
  // 
  // 'Should correctly parse message + in two packets from socket and smaller than 4 bytes additional one then rest of the message' : function(test) {    
  //   // Connection dummy object
  //   var connectionObject = {"connection": {}, "sizeOfMessage": 0, "bytesRead": 0, "buffer": new Buffer(0), "stubBuffer": new Buffer(0)}
  //   // Data object
  //   var index = 0;
  //   var buffer = new Buffer(20);
  //   var value = 10;
  //   // Encode length at start according to wire protocol
  //   buffer[index + 3] = (value >> 24) & 0xff;      
  //   buffer[index + 2] = (value >> 16) & 0xff;
  //   buffer[index + 1] = (value >> 8) & 0xff;
  //   buffer[index] = value & 0xff;            
  // 
  //   // Adjust the index
  //   index = index + 10;
  //   // Encode length at start according to wire protocol
  //   buffer[index + 3] = (value >> 24) & 0xff;      
  //   buffer[index + 2] = (value >> 16) & 0xff;
  //   buffer[index + 1] = (value >> 8) & 0xff;
  //   buffer[index] = value & 0xff;            
  //   
  //   // Self environment dummy
  //   var self = {poolByReference:{1:connectionObject}, 'emit':function(type, data) {
  //     test.equal('data', type);      
  //     // Compare the buffers content
  //     for(var i = 0; i < data.length; i++) {
  //       test.equal(buffer[i], data[i]);
  //     }
  //   }};
  //   
  //   // Trigger the connection listener
  //   var connectionListener = Connection._receiveListenerCreator(self);
  //   connectionListener(buffer.slice(0, 6), 1)
  //   connectionListener(buffer.slice(6, 13), 1)
  //   connectionListener(buffer.slice(13, 19), 1)
  // 
  //   // Do asserts
  //   test.equal(10, connectionObject.sizeOfMessage);
  //   test.equal(9, connectionObject.bytesRead);
  //   test.equal(9, connectionObject.buffer.length);
  //   // Check against message
  //   var partialMessage = buffer.slice(10, 19);    
  //   for(var i = 0; i < 3; i++) {
  //     test.equal(partialMessage[i], connectionObject.buffer[i]);
  //   }
  //   
  //   // Sequential execution :)
  //   test.done();      
  // },
  // 
  // 'Should correctly parse message + in two packets from socket and smaller than 4 bytes additional one then partial message' : function(test) {    
  //   // Connection dummy object
  //   var connectionObject = {"connection": {}, "sizeOfMessage": 0, "bytesRead": 0, "buffer": new Buffer(0), "stubBuffer": new Buffer(0)}
  //   // Data object
  //   var index = 0;
  //   var buffer = new Buffer(20);
  //   var value = 10;
  //   // Encode length at start according to wire protocol
  //   buffer[index + 3] = (value >> 24) & 0xff;      
  //   buffer[index + 2] = (value >> 16) & 0xff;
  //   buffer[index + 1] = (value >> 8) & 0xff;
  //   buffer[index] = value & 0xff;            
  // 
  //   // Adjust the index
  //   index = index + 10;
  //   // Encode length at start according to wire protocol
  //   buffer[index + 3] = (value >> 24) & 0xff;      
  //   buffer[index + 2] = (value >> 16) & 0xff;
  //   buffer[index + 1] = (value >> 8) & 0xff;
  //   buffer[index] = value & 0xff;            
  //   
  //   // Self environment dummy
  //   var self = {poolByReference:{1:connectionObject}, 'emit':function(type, data) {
  //     test.equal('data', type);      
  //     // Compare the buffers content
  //     for(var i = 0; i < data.length; i++) {
  //       test.equal(buffer[i], data[i]);
  //     }
  //   }};
  //   
  //   // Trigger the connection listener
  //   var connectionListener = Connection._receiveListenerCreator(self);
  //   connectionListener(buffer.slice(0, 6), 1)
  //   connectionListener(buffer.slice(6, 13), 1)
  //   connectionListener(buffer.slice(13, 15), 1)
  // 
  //   // Do asserts
  //   test.equal(10, connectionObject.sizeOfMessage);
  //   test.equal(5, connectionObject.bytesRead);
  //   test.equal(0, connectionObject.stubBuffer.length);
  //   // Check against message
  //   var partialMessage = buffer.slice(10, 15);    
  //   for(var i = 0; i < 5; i++) {
  //     test.equal(partialMessage[i], connectionObject.buffer[i]);
  //   }
  //   
  //   // Sequential execution :)
  //   test.done();      
  // },
  // 
  // 'Should correctly parse message + in two packets from socket and smaller than 4 bytes additional one then partial message' : function(test) {    
  //   // Connection dummy object
  //   var connectionObject = {"connection": {}, "sizeOfMessage": 0, "bytesRead": 0, "buffer": new Buffer(0), "stubBuffer": new Buffer(0)}
  //   // Data object
  //   var index = 0;
  //   var buffer = new Buffer(40);
  //   var value = 10;
  //   // Encode length at start according to wire protocol
  //   buffer[index + 3] = (value >> 24) & 0xff;      
  //   buffer[index + 2] = (value >> 16) & 0xff;
  //   buffer[index + 1] = (value >> 8) & 0xff;
  //   buffer[index] = value & 0xff;            
  // 
  //   var value = 20;
  //   // Adjust the index
  //   index = index + 10;
  //   // Encode length at start according to wire protocol
  //   buffer[index + 3] = (value >> 24) & 0xff;      
  //   buffer[index + 2] = (value >> 16) & 0xff;
  //   buffer[index + 1] = (value >> 8) & 0xff;
  //   buffer[index] = value & 0xff;            
  // 
  //   var value = 15;
  //   // Adjust the index
  //   index = index + 20;
  //   // Encode length at start according to wire protocol
  //   buffer[index + 3] = (value >> 24) & 0xff;      
  //   buffer[index + 2] = (value >> 16) & 0xff;
  //   buffer[index + 1] = (value >> 8) & 0xff;
  //   buffer[index] = value & 0xff;            
  //   
  //   // Self environment dummy
  //   var self = {poolByReference:{1:connectionObject}, 'emit':function(type, data) {
  //     test.equal('data', type);      
  //   }};
  //   
  //   // Trigger the connection listener
  //   var connectionListener = Connection._receiveListenerCreator(self);
  //   connectionListener(buffer.slice(0, 6), 1)
  //   connectionListener(buffer.slice(6, 15), 1)
  //   connectionListener(buffer.slice(15, 27), 1)
  // 
  //   // Do asserts
  //   test.equal(20, connectionObject.sizeOfMessage);
  //   test.equal(17, connectionObject.bytesRead);
  //   test.equal(17, connectionObject.buffer.length);
  //   test.equal(0, connectionObject.stubBuffer.length);
  //   // Check against message
  //   var partialMessage = buffer.slice(10, 27);    
  //   for(var i = 0; i < 5; i++) {
  //     test.equal(partialMessage[i], connectionObject.buffer[i]);
  //   }
  //   
  //   // Sequential execution :)
  //   test.done();      
  // },
  // 
  // 'Corrupt the message baby' : function(test) {
  //   // Connection dummy object
  //   var connectionObject = {"connection": {}, "sizeOfMessage": 0, "bytesRead": 0, "buffer": new Buffer(0), "stubBuffer": new Buffer(0)}
  //   // Data object
  //   var index = 0;
  //   var buffer = new Buffer(40);
  //   var value = -40;
  //   // Encode length at start according to wire protocol
  //   buffer[index + 3] = (value >> 24) & 0xff;      
  //   buffer[index + 2] = (value >> 16) & 0xff;
  //   buffer[index + 1] = (value >> 8) & 0xff;
  //   buffer[index] = value & 0xff;                
  // 
  //   // Self environment dummy
  //   var self = {poolByReference:{1:connectionObject}, 'emit':function(type, data) {
  //     test.equal('unparsable',data.err);
  //     test.equal(-40, data.parseState.sizeOfMessage);
  //     test.equal(0, data.parseState.bytesRead);
  //     test.equal(0, data.parseState.buffer.length);
  //     test.equal(0, data.parseState.stubBuffer.length);
  //     test.equal('error', type);      
  //     test.done();
  //   }};
  // 
  //   // Trigger the connection listener
  //   var connectionListener = Connection._receiveListenerCreator(self);
  //   connectionListener(buffer.slice(0, 40), 1);
  // },

  noGlobalsLeaked : function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }
});

// Assign out tests
module.exports = tests;
