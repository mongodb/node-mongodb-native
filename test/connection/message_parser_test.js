// var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();

var testCase = require('../../deps/nodeunit').testCase,
  Buffer = require('buffer').Buffer,
  gleak = require('../../tools/gleak'),
  Connection = require('../../lib/mongodb/connection/connection').Connection;

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
    // Data object
    var index = 0;
    var buffer = new Buffer(10);
    var value = 10;
    // Encode length at start according to wire protocol
    buffer[index + 3] = (value >> 24) & 0xff;      
    buffer[index + 2] = (value >> 16) & 0xff;
    buffer[index + 1] = (value >> 8) & 0xff;
    buffer[index] = value & 0xff;            
  
    // Dummy object for receiving message
    var self = {maxBsonSize: (4 * 1024 * 1024 * 4 * 3), emit:function(message, data) {
      assertBuffersEqual(test, buffer, data);
      test.done();
    }};
    
    // Create a connection object
    var dataHandler = Connection.createDataHandler(self);
  
    // Execute parsing of message
    dataHandler(buffer);
  },
  
  'Should correctly parse perfectly aligned double message from socket' : function(test) {    
    // Data object
    var index = 0;
    var buffer = new Buffer(20);
    var value = 10;
    // Encode length at start according to wire protocol
    buffer[index + 3] = (value >> 24) & 0xff;      
    buffer[index + 2] = (value >> 16) & 0xff;
    buffer[index + 1] = (value >> 8) & 0xff;
    buffer[index] = value & 0xff;            
  
    // Adjust the index
    index = index + 10;
    // Encode length at start according to wire protocol
    buffer[index + 3] = (value >> 24) & 0xff;      
    buffer[index + 2] = (value >> 16) & 0xff;
    buffer[index + 1] = (value >> 8) & 0xff;
    buffer[index] = value & 0xff;            
    buffer[index+4] = 0xa;            
  
    // var result index
    var resultIndex = 0;
    // Dummy object for receiving message
    var self = {maxBsonSize: (4 * 1024 * 1024 * 4 * 3), emit:function(message, data) {
      assertBuffersEqual(test, buffer.slice(resultIndex, resultIndex + 10), data);
      resultIndex = resultIndex + 10;
      
      if(resultIndex === buffer.length) {
        test.done();
      }
    }};
    
    // Create a connection object
    var dataHandler = Connection.createDataHandler(self);
    // Execute parsing of message
    dataHandler(buffer);
  },
  
  'Should correctly parse message + in two packets from socket' : function(test) {    
    // Data object
    var index = 0;
    var buffer = new Buffer(10);
    var value = 10;
    // Encode length at start according to wire protocol
    buffer[index + 3] = (value >> 24) & 0xff;      
    buffer[index + 2] = (value >> 16) & 0xff;
    buffer[index + 1] = (value >> 8) & 0xff;
    buffer[index] = value & 0xff;            
  
    // Dummy object for receiving message
    var self = {maxBsonSize: (4 * 1024 * 1024 * 4 * 3), emit:function(message, data) {
      assertBuffersEqual(test, buffer, data);
      test.done();
    }};
    
    // Create a connection object
    var dataHandler = Connection.createDataHandler(self);
  
    // Execute parsing of message
    dataHandler(buffer.slice(0, 6));
    dataHandler(buffer.slice(6));
  },
  
  'Should correctly parse message + in two packets from socket and partial third one' : function(test) {    
    // Data object
    var index = 0;
    var buffer = new Buffer(20);
    var value = 10;
    // Encode length at start according to wire protocol
    buffer[index + 3] = (value >> 24) & 0xff;      
    buffer[index + 2] = (value >> 16) & 0xff;
    buffer[index + 1] = (value >> 8) & 0xff;
    buffer[index] = value & 0xff;            
  
    // Adjust the index
    index = index + 10;
    // Encode length at start according to wire protocol
    buffer[index + 3] = (value >> 24) & 0xff;      
    buffer[index + 2] = (value >> 16) & 0xff;
    buffer[index + 1] = (value >> 8) & 0xff;
    buffer[index] = value & 0xff;            
    buffer[index + 4] = 0xff;            
    buffer[index + 5] = 0xff;            
  
    // Dummy object for receiving message
    var self = {maxBsonSize: (4 * 1024 * 1024 * 4 * 3), emit:function(message, data) {
      assertBuffersEqual(test, buffer.slice(0, 10), data);
    }};
    
    // Create a connection object
    var dataHandler = Connection.createDataHandler(self);
  
    // Execute parsing of message
    dataHandler(buffer.slice(0, 6));
    dataHandler(buffer.slice(6, 15));
    
    // Check status of the parser
    test.equal(5, self.bytesRead);
    test.equal(10, self.sizeOfMessage);
    assertBuffersEqual(test, buffer.slice(10, 15), self.buffer.slice(0, 5));
    test.equal(null, self.stubBuffer);
    // Finish test
    test.done();
  },
  
  'Should correctly parse message + in two packets from socket and smaller than 4 bytes additional one' : function(test) {    
    // Data object
    var index = 0;
    var buffer = new Buffer(20);
    var value = 10;
    // Encode length at start according to wire protocol
    buffer[index + 3] = (value >> 24) & 0xff;      
    buffer[index + 2] = (value >> 16) & 0xff;
    buffer[index + 1] = (value >> 8) & 0xff;
    buffer[index] = value & 0xff;            
  
    // Adjust the index
    index = index + 10;
    // Encode length at start according to wire protocol
    buffer[index + 3] = (value >> 24) & 0xff;      
    buffer[index + 2] = (value >> 16) & 0xff;
    buffer[index + 1] = (value >> 8) & 0xff;
    buffer[index] = value & 0xff;            
  
    // Dummy object for receiving message
    var self = {maxBsonSize: (4 * 1024 * 1024 * 4 * 3), emit:function(message, data) {
      assertBuffersEqual(test, buffer.slice(0, 10), data);
    }};
    
    // Create a connection object
    var dataHandler = Connection.createDataHandler(self);
  
    // Execute parsing of message
    dataHandler(buffer.slice(0, 6));
    dataHandler(buffer.slice(6, 13));
  
    // Check status of the parser
    test.equal(0, self.bytesRead);
    test.equal(0, self.sizeOfMessage);
    test.equal(null, self.buffer);
    assertBuffersEqual(test, buffer.slice(10, 13), self.stubBuffer);
    test.done();
  },
  
  'Should correctly parse message + in two packets from socket and smaller than 4 bytes additional one then rest of the message' : function(test) {    
    // Data object
    var index = 0;
    var buffer = new Buffer(20);
    var value = 10;
    // Encode length at start according to wire protocol
    buffer[index + 3] = (value >> 24) & 0xff;      
    buffer[index + 2] = (value >> 16) & 0xff;
    buffer[index + 1] = (value >> 8) & 0xff;
    buffer[index] = value & 0xff;            
  
    // Adjust the index
    index = index + 10;
    // Encode length at start according to wire protocol
    buffer[index + 3] = (value >> 24) & 0xff;      
    buffer[index + 2] = (value >> 16) & 0xff;
    buffer[index + 1] = (value >> 8) & 0xff;
    buffer[index] = value & 0xff;            
    buffer[index + 4] = 0xff;
    buffer[index + 5] = 0xff;
    buffer[index + 6] = 0xff;
    buffer[index + 7] = 0xff;
    buffer[index + 8] = 0xfd;
    buffer[index + 9] = 0xfe;
    
    // Dummy object for receiving message
    var self = {maxBsonSize: (4 * 1024 * 1024 * 4 * 3), emit:function(message, data) {
      assertBuffersEqual(test, buffer.slice(0, 10), data);
    }};
    
    // Create a connection object
    var dataHandler = Connection.createDataHandler(self);
  
    // Execute parsing of message
    dataHandler(buffer.slice(0, 6));
    dataHandler(buffer.slice(6, 13));
    dataHandler(buffer.slice(13, 19));
  
    // Check status of the parser
    test.equal(9, self.bytesRead);
    test.equal(10, self.sizeOfMessage);
    test.equal(null, self.stubBuffer);
    assertBuffersEqual(test, buffer.slice(10, 19), self.buffer.slice(0, 9));
    // Test done
    test.done();
  },
  
  'Should correctly parse message + in two packets from socket and smaller than 4 bytes additional one then partial message' : function(test) {    
    // Data object
    var index = 0;
    var buffer = new Buffer(20);
    var value = 10;
    // Encode length at start according to wire protocol
    buffer[index + 3] = (value >> 24) & 0xff;      
    buffer[index + 2] = (value >> 16) & 0xff;
    buffer[index + 1] = (value >> 8) & 0xff;
    buffer[index] = value & 0xff;            
  
    // Adjust the index
    index = index + 10;
    // Encode length at start according to wire protocol
    buffer[index + 3] = (value >> 24) & 0xff;      
    buffer[index + 2] = (value >> 16) & 0xff;
    buffer[index + 1] = (value >> 8) & 0xff;
    buffer[index] = value & 0xff;            
    // Add data to check
    buffer[index + 4] = 0xff;
    buffer[index + 5] = 0xff;
    buffer[index + 6] = 0xff;
    buffer[index + 7] = 0xff;
    buffer[index + 8] = 0xfd;
    buffer[index + 9] = 0xfe;
  
    // Dummy object for receiving message
    var self = {maxBsonSize: (4 * 1024 * 1024 * 4 * 3), emit:function(message, data) {
      assertBuffersEqual(test, buffer.slice(0, 10), data);
    }};
    
    // Create a connection object
    var dataHandler = Connection.createDataHandler(self);
  
    // Execute parsing of message
    dataHandler(buffer.slice(0, 6));
    dataHandler(buffer.slice(6, 13));
    dataHandler(buffer.slice(13, 15));
  
    // Check status of the parser
    test.equal(5, self.bytesRead);
    test.equal(10, self.sizeOfMessage);
    test.equal(null, self.stubBuffer);
    assertBuffersEqual(test, buffer.slice(10, 15), self.buffer.slice(0, 5));
    // Test done
    test.done();
  },
  
  'Should correctly parse message + in two packets from socket and smaller than 4 bytes additional one then partial message' : function(test) {    
    // Data object
    var index = 0;
    var buffer = new Buffer(40);
    var value = 10;
    // Encode length at start according to wire protocol
    buffer[index + 3] = (value >> 24) & 0xff;      
    buffer[index + 2] = (value >> 16) & 0xff;
    buffer[index + 1] = (value >> 8) & 0xff;
    buffer[index] = value & 0xff;            
  
    var value = 20;
    // Adjust the index
    index = index + 10;
    // Encode length at start according to wire protocol
    buffer[index + 3] = (value >> 24) & 0xff;      
    buffer[index + 2] = (value >> 16) & 0xff;
    buffer[index + 1] = (value >> 8) & 0xff;
    buffer[index] = value & 0xff;            
  
    var value = 15;
    // Adjust the index
    index = index + 20;
    // Encode length at start according to wire protocol
    buffer[index + 3] = (value >> 24) & 0xff;      
    buffer[index + 2] = (value >> 16) & 0xff;
    buffer[index + 1] = (value >> 8) & 0xff;
    buffer[index] = value & 0xff;            
  
    // Dummy object for receiving message
    var self = {maxBsonSize: (4 * 1024 * 1024 * 4 * 3), emit:function(message, data) {
      assertBuffersEqual(test, buffer.slice(0, 10), data);
    }};
    
    // Create a connection object
    var dataHandler = Connection.createDataHandler(self);
  
    // Execute parsing of message
    dataHandler(buffer.slice(0, 6));
    dataHandler(buffer.slice(6, 15));
    dataHandler(buffer.slice(15, 27));
    
    // Check status of the parser
    test.equal(17, self.bytesRead);
    test.equal(20, self.sizeOfMessage);
    test.equal(null, self.stubBuffer);
    assertBuffersEqual(test, buffer.slice(10, 27), self.buffer.slice(0, 17));
    // Test done
    test.done();
  },
  
  'Corrupt the message baby' : function(test) {
    // Data object
    var index = 0;
    var buffer = new Buffer(40);
    var value = -40;
    // Encode length at start according to wire protocol
    buffer[index + 3] = (value >> 24) & 0xff;      
    buffer[index + 2] = (value >> 16) & 0xff;
    buffer[index + 1] = (value >> 8) & 0xff;
    buffer[index] = value & 0xff;                
  
    // Dummy object for receiving message
    var self = {maxBsonSize: (4 * 1024 * 1024 * 4 * 3), emit:function(message, data) {
      test.equal('parseError', message)
      // test.equal('socketHandler', data.err)
    }};
    
    // Create a connection object
    var dataHandler = Connection.createDataHandler(self);
  
    // Execute parsing of message
    dataHandler(buffer.slice(0, 6));
    dataHandler(buffer.slice(6, 15));
    dataHandler(buffer.slice(15, 27));
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
