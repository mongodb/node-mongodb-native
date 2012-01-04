/**
 * Module dependencies.
 */
var BinaryParser = require('./binary_parser').BinaryParser
  , Long = require('../goog/math/long').Long
  , Double = require('./double').Double
  , Timestamp = require('./timestamp').Timestamp
  , ObjectID = require('./objectid').ObjectID
  , Symbol = require('./symbol').Symbol
  , Code = require('./code').Code
  , MinKey = require('./min_key').MinKey
  , MaxKey = require('./max_key').MaxKey
  , DBRef = require('./db_ref').DBRef
  , Binary = require('./binary').Binary
  , debug = require('util').debug
  , crypto = require('crypto')
  , inspect = require('util').inspect
  , inherits = require('util').inherits
  , ieee754 = require('./float_parser');

/**
 * BSON constructor.
 */

function BSON () {};

// BSON MAX VALUES
BSON.BSON_INT32_MAX = 0x80000000;
BSON.BSON_INT32_MAX = -0x80000000;

// JS MAX PRECISE VALUES
BSON.JS_INT_MAX = 0x20000000000000;  // Any integer up to 2^53 can be precisely represented by a double.
BSON.JS_INT_MIN = -0x20000000000000;  // Any integer down to -2^53 can be precisely represented by a double.

// Internal long versions
var JS_INT_MAX_LONG = Long.fromNumber(0x20000000000000);  // Any integer up to 2^53 can be precisely represented by a double.
var JS_INT_MIN_LONG = Long.fromNumber(-0x20000000000000);  // Any integer down to -2^53 can be precisely represented by a double.

// BSON DATA TYPES
BSON.BSON_DATA_NUMBER = 1;
BSON.BSON_DATA_STRING = 2;
BSON.BSON_DATA_OBJECT = 3;
BSON.BSON_DATA_ARRAY = 4;
BSON.BSON_DATA_BINARY = 5;
BSON.BSON_DATA_OID = 7;
BSON.BSON_DATA_BOOLEAN = 8;
BSON.BSON_DATA_DATE = 9;
BSON.BSON_DATA_NULL = 10;
BSON.BSON_DATA_REGEXP = 11;
BSON.BSON_DATA_CODE = 13;
BSON.BSON_DATA_SYMBOL = 14;
BSON.BSON_DATA_CODE_W_SCOPE = 15;
BSON.BSON_DATA_INT = 16;
BSON.BSON_DATA_TIMESTAMP = 17;
BSON.BSON_DATA_LONG = 18;
BSON.BSON_DATA_MIN_KEY = 0xff;
BSON.BSON_DATA_MAX_KEY = 0x7f;

// BSON BINARY DATA SUBTYPES
BSON.BSON_BINARY_SUBTYPE_DEFAULT = 0;
BSON.BSON_BINARY_SUBTYPE_FUNCTION = 1;
BSON.BSON_BINARY_SUBTYPE_BYTE_ARRAY = 2;
BSON.BSON_BINARY_SUBTYPE_UUID = 3;
BSON.BSON_BINARY_SUBTYPE_MD5 = 4;
BSON.BSON_BINARY_SUBTYPE_USER_DEFINED = 128;

/**
 * Serialize `data` as BSON.
 *
 * @param {TODO} data
 * @param {Bool|null} checkKeys - TODO
 * @return {TODO}
 */
var calculateObjectSize = BSON.calculateObjectSize = function(object, serializeFunctions) {
  var totalLength = (4 + 1);
    
  if(Array.isArray(object)) {
    for(var i = 0; i < object.length; i++) {
      totalLength += calculateElement(i.toString(), object[i], serializeFunctions)
    }
  } else {
    for(var key in object) {
      totalLength += calculateElement(key, object[key], serializeFunctions)
    }
  } 

  return totalLength;
}

var calculateElement = function(name, value, serializeFunctions) {
  switch(typeof value) {
    case 'string':
      return 1 + Buffer.byteLength(name, 'utf8') + 1 + 4 + Buffer.byteLength(value, 'utf8') + 1;
    case 'number':
      if(~~value === value) { // 32 bit
        if(value >= BSON.BSON_INT32_MAX || value < BSON.BSON_INT32_MAX) {
          return (name != null ? (Buffer.byteLength(name) + 1) : 0) + (4 + 1);
        } else if(value >= BSON.JS_INT_MAX || value < BSON.JS_INT_MIN) {
          return (name != null ? (Buffer.byteLength(name) + 1) : 0) + (8 + 1);
        } else {
          return (name != null ? (Buffer.byteLength(name) + 1) : 0) + (8 + 1);
        }
      } else {  // 64 bit
        return (name != null ? (Buffer.byteLength(name) + 1) : 0) + (8 + 1);
      }
    case 'undefined':
      return (name != null ? (Buffer.byteLength(name) + 1) : 0) + (1);
    case 'boolean':
      return (name != null ? (Buffer.byteLength(name) + 1) : 0) + (1 + 1);
    case 'object':   
      if(value instanceof ObjectID) {
        return (name != null ? (Buffer.byteLength(name) + 1) : 0) + (12 + 1);
      } else if(value instanceof Date) {
        return (name != null ? (Buffer.byteLength(name) + 1) : 0) + (8 + 1);
      } else if(Buffer.isBuffer(value)) {
        return (name != null ? (Buffer.byteLength(name) + 1) : 0) + (1 + 4 + 1) + value.length;
      } else if(value instanceof Long || value instanceof Double || value instanceof Timestamp) {
        return (name != null ? (Buffer.byteLength(name) + 1) : 0) + (8 + 1);        
      } else if(value instanceof Code) {
        // Calculate size depending on the availability of a scope
        if(value.scope != null && Object.keys(value.scope).length > 0) {
          return (name != null ? (Buffer.byteLength(name) + 1) : 0) + 1 + 4 + 4 + Buffer.byteLength(value.code.toString(), 'utf8') + 1 + calculateObjectSize(value.scope);
        } else {
          return (name != null ? (Buffer.byteLength(name) + 1) : 0) + 1 + 4 + Buffer.byteLength(value.code.toString(), 'utf8') + 1;
        }                      
      } else if(value == null || value instanceof MinKey || value instanceof MaxKey) {
        return (name != null ? (Buffer.byteLength(name) + 1) : 0) + (1);
      } else if(value instanceof Binary) {
        return (name != null ? (Buffer.byteLength(name) + 1) : 0) + (value.position + 1 + 4 + 1);
      } else if(value instanceof Symbol) {
        return (name != null ? (Buffer.byteLength(name) + 1) : 0) + (Buffer.byteLength(value.value, 'utf8') + 4 + 1 + 1);
      } else if(value instanceof DBRef) {
        // Set up correct object for serialization
        var ordered_values = {
            '$ref': value.namespace
          , '$id' : value.oid
        };

        // Add db reference if it exists
        if(null != value.db) {
          ordered_values['$db'] = value.db;
        }
        
        return (name != null ? (Buffer.byteLength(name) + 1) : 0) + 1 + calculateObjectSize(ordered_values, serializeFunctions);
      } else if(value instanceof RegExp || toString.call(value) === '[object RegExp]') {
          return (name != null ? (Buffer.byteLength(name) + 1) : 0) + 1 + Buffer.byteLength(value.source, 'utf8') + 1
            + (value.global ? 1 : 0) + (value.ignoreCase ? 1 : 0) + (value.multiline ? 1 : 0) + 1        
      } else {
        return (name != null ? (Buffer.byteLength(name) + 1) : 0) + calculateObjectSize(value, serializeFunctions) + 1;        
      }
    case 'function':
      // WTF for 0.4.X where typeof /someregexp/ === 'function'
      if(value instanceof RegExp || toString.call(value) === '[object RegExp]') {        
        return (name != null ? (Buffer.byteLength(name) + 1) : 0) + 1 + Buffer.byteLength(value.source, 'utf8') + 1
          + (value.global ? 1 : 0) + (value.ignoreCase ? 1 : 0) + (value.multiline ? 1 : 0) + 1
      } else {
        if(serializeFunctions && value.scope != null && Object.keys(value.scope).length > 0) {
          return (name != null ? (Buffer.byteLength(name) + 1) : 0) + 1 + 4 + 4 + Buffer.byteLength(value.toString(), 'utf8') + 1 + calculateObjectSize(value.scope);
        } else if(serializeFunctions) {
          return (name != null ? (Buffer.byteLength(name) + 1) : 0) + 1 + 4 + Buffer.byteLength(value.toString(), 'utf8') + 1;
        }      
      }
  }
  
  return 0;
}

var serializeWithBufferAndIndex = BSON.serializeWithBufferAndIndex = function serializeWithBufferAndIndex(object, checkKeys, buffer, index, serializeFunctions) {
  // Default setting false
  serializeFunctions = serializeFunctions == null ? false : serializeFunctions;
  // Write end information (length of the object)
  var size = buffer.length;
  // Write the size of the object
  buffer[index++] = size & 0xff;          
  buffer[index++] = (size >> 8) & 0xff;
  buffer[index++] = (size >> 16) & 0xff;
  buffer[index++] = (size >> 24) & 0xff;     
  return serializeObject(object, checkKeys, buffer, index, serializeFunctions) - 1;
}

var serializeObject = function(object, checkKeys, buffer, index, serializeFunctions) {
  // Process the object
  if(Array.isArray(object)) {
    for(var i = 0; i < object.length; i++) {
      index = packElement(i.toString(), object[i], checkKeys, buffer, index, serializeFunctions);
    }
  } else {
    for(var key in object) {
      // Check the key and throw error if it's illegal
      if(checkKeys ==  true && (key != '$db' && key != '$ref' && key != '$id')) {
        BSON.checkKey(key);        
      }

      // Pack the element
      index = packElement(key, object[key], checkKeys, buffer, index, serializeFunctions);
    }    
  }  
  
  // Write zero
  buffer[index++] = 0;
  return index;
}

var packElement = function(name, value, checkKeys, buffer, index, serializeFunctions) {
  // console.log("packElement: " + name + " :: " + value)
  var startIndex = index;
  
  switch(typeof value) {
    case 'string':
      // Encode String type
      buffer[index++] = BSON.BSON_DATA_STRING;
      // Encode the name
      index = index + buffer.write(name, index, 'utf8') + 1;
      buffer[index - 1] = 0;          
      
      // Calculate size
      var size = Buffer.byteLength(value) + 1;
      // Write the size of the string to buffer
      buffer[index + 3] = (size >> 24) & 0xff;     
      buffer[index + 2] = (size >> 16) & 0xff;
      buffer[index + 1] = (size >> 8) & 0xff;
      buffer[index] = size & 0xff;
      // Ajust the index
      index = index + 4;
      // Write the string
      buffer.write(value, index, 'utf8');
      // Update index
      index = index + size - 1;
      // Write zero
      buffer[index++] = 0;
      // Return index
      return index;
    case 'number':
      // We have an integer value
      if(~~value === value) {
        // If the value fits in 32 bits encode as int, if it fits in a double
        // encode it as a double, otherwise long
        if(value >= BSON.BSON_INT32_MAX || value < BSON.BSON_INT32_MAX) {
          // Set int type 32 bits or less
          buffer[index++] = BSON.BSON_DATA_INT;          
          // Encode the name
          index = index + buffer.write(name, index, 'utf8') + 1;
          buffer[index - 1] = 0;          
          // Write the int value
          buffer[index++] = value & 0xff;                      
          buffer[index++] = (value >> 8) & 0xff;
          buffer[index++] = (value >> 16) & 0xff;
          buffer[index++] = (value >> 24) & 0xff;      
        } else if(value >= BSON.JS_INT_MAX || value < BSON.JS_INT_MIN) {
          // Encode as double
          buffer[index++] = BSON.BSON_DATA_NUMBER;
          // Encode the name
          index = index + buffer.write(name, index, 'utf8') + 1;
          buffer[index - 1] = 0;          
          // Write float
          ieee754.writeIEEE754(buffer, value, index, 'little', 52, 8);
          // Ajust index
          index = index + 8;                      
        } else {
          // Set long type
          buffer[index++] = BSON.BSON_DATA_LONG;          
          // Encode the name
          index = index + buffer.write(name, index, 'utf8') + 1;
          buffer[index - 1] = 0;          
          // Encode low bits
          buffer[index++] = lowBits & 0xff;            
          buffer[index++] = (lowBits >> 8) & 0xff;
          buffer[index++] = (lowBits >> 16) & 0xff;
          buffer[index++] = (lowBits >> 24) & 0xff;      
          // Encode high bits
          buffer[index++] = highBits & 0xff;            
          buffer[index++] = (highBits >> 8) & 0xff;
          buffer[index++] = (highBits >> 16) & 0xff;
          buffer[index++] = (highBits >> 24) & 0xff;                 
        }
      } else {
        // Encode as double
        buffer[index++] = BSON.BSON_DATA_NUMBER;
        // Encode the name
        index = index + buffer.write(name, index, 'utf8') + 1;
        buffer[index - 1] = 0;          
        // Write float
        ieee754.writeIEEE754(buffer, value, index, 'little', 52, 8);
        // Ajust index
        index = index + 8;                      
      }
      
      return index;
    case 'undefined':
      // Set long type
      buffer[index++] = BSON.BSON_DATA_NULL;
      // Encode the name
      index = index + buffer.write(name, index, 'utf8') + 1;
      buffer[index - 1] = 0;
      return index;      
    case 'boolean':
      // Write the type
      buffer[index++] = BSON.BSON_DATA_BOOLEAN;
      // Encode the name
      index = index + buffer.write(name, index, 'utf8') + 1;
      buffer[index - 1] = 0;
      // Encode the boolean value
      buffer[index++] = value ? 1 : 0;
      return index;
    case 'object':   
      if(value instanceof ObjectID) {
        // Write the type
        buffer[index++] = BSON.BSON_DATA_OID;
        // Encode the name
        index = index + buffer.write(name, index, 'utf8') + 1;
        buffer[index - 1] = 0;
        // Write objectid
        buffer.write(value.id, index, 'binary');
        // Ajust index
        index = index + 12;
        return index;
      } else if(value instanceof Date) {
        // Write the type
        buffer[index++] = BSON.BSON_DATA_DATE;
        // Encode the name
        index = index + buffer.write(name, index, 'utf8') + 1;
        buffer[index - 1] = 0;
        
        // Write the date
        var dateInMilis = Long.fromNumber(value.getTime());
        var lowBits = dateInMilis.getLowBits();
        var highBits = dateInMilis.getHighBits();
        // Encode low bits
        buffer[index++] = lowBits & 0xff;            
        buffer[index++] = (lowBits >> 8) & 0xff;
        buffer[index++] = (lowBits >> 16) & 0xff;
        buffer[index++] = (lowBits >> 24) & 0xff;      
        // Encode high bits
        buffer[index++] = highBits & 0xff;            
        buffer[index++] = (highBits >> 8) & 0xff;
        buffer[index++] = (highBits >> 16) & 0xff;
        buffer[index++] = (highBits >> 24) & 0xff;      
        return index;        
      } else if(Buffer.isBuffer(value)) {
        // Write the type
        buffer[index++] = BSON.BSON_DATA_BINARY;
        // Encode the name
        index = index + buffer.write(name, index, 'utf8') + 1;
        buffer[index - 1] = 0;
        // Get size of the buffer (current write point)
        var size = value.length;
        // Write the size of the string to buffer
        buffer[index++] = size & 0xff;
        buffer[index++] = (size >> 8) & 0xff;
        buffer[index++] = (size >> 16) & 0xff;
        buffer[index++] = (size >> 24) & 0xff;     
        // Write the default subtype
        buffer[index++] = BSON.BSON_BINARY_SUBTYPE_DEFAULT;
        // Copy the content form the binary field to the buffer
        value.copy(buffer, index, 0, size);
        // Adjust the index
        index = index + size;
        return index;
      } else if(value instanceof Long || value instanceof Timestamp) {
        // Write the type
        buffer[index++] = value instanceof Long ? BSON.BSON_DATA_LONG : BSON.BSON_DATA_TIMESTAMP;
        // Encode the name
        index = index + buffer.write(name, index, 'utf8') + 1;
        buffer[index - 1] = 0;
        // Write the date
        var lowBits = value.getLowBits();
        var highBits = value.getHighBits();
        // Encode low bits
        buffer[index++] = lowBits & 0xff;            
        buffer[index++] = (lowBits >> 8) & 0xff;
        buffer[index++] = (lowBits >> 16) & 0xff;
        buffer[index++] = (lowBits >> 24) & 0xff;      
        // Encode high bits
        buffer[index++] = highBits & 0xff;            
        buffer[index++] = (highBits >> 8) & 0xff;
        buffer[index++] = (highBits >> 16) & 0xff;
        buffer[index++] = (highBits >> 24) & 0xff;      
        return index;
      } else if(value instanceof Double) {
        // Encode as double
        buffer[index++] = BSON.BSON_DATA_NUMBER;
        // Encode the name
        index = index + buffer.write(name, index, 'utf8') + 1;
        buffer[index - 1] = 0;          
        // Write float
        ieee754.writeIEEE754(buffer, value, index, 'little', 52, 8);
        // Ajust index
        index = index + 8;
        return index;
      } else if(value instanceof Code) {
        if(value.scope != null && Object.keys(value.scope).length > 0) {          
          // Write the type
          buffer[index++] = BSON.BSON_DATA_CODE_W_SCOPE;
          // Encode the name
          index = index + buffer.write(name, index, 'utf8') + 1;
          buffer[index - 1] = 0;
          // Calculate the scope size
          var scopeSize = BSON.calculateObjectSize(value.scope);
          // Function string
          var functionString = value.code.toString();
          // Function Size
          var codeSize = Buffer.byteLength(functionString) + 1;

          // Calculate full size of the object
          var totalSize = 4 + codeSize + scopeSize + 4;

          // Write the total size of the object
          buffer[index++] = totalSize & 0xff;
          buffer[index++] = (totalSize >> 8) & 0xff;
          buffer[index++] = (totalSize >> 16) & 0xff;
          buffer[index++] = (totalSize >> 24) & 0xff;     

          // Write the size of the string to buffer
          buffer[index++] = codeSize & 0xff;
          buffer[index++] = (codeSize >> 8) & 0xff;
          buffer[index++] = (codeSize >> 16) & 0xff;
          buffer[index++] = (codeSize >> 24) & 0xff;     

          // Write the string
          buffer.write(functionString, index, 'utf8');
          // Update index
          index = index + codeSize - 1;
          // Write zero
          buffer[index++] = 0;
          // Serialize the scope object          
          var scopeObjectBuffer = new Buffer(scopeSize);
          // Execute the serialization into a seperate buffer
          serializeObject(value.scope, checkKeys, scopeObjectBuffer, 0, serializeFunctions);
          
          // Adjusted scope Size (removing the header)
          var scopeDocSize = scopeSize;
          // Write scope object size
          buffer[index++] = scopeDocSize & 0xff;
          buffer[index++] = (scopeDocSize >> 8) & 0xff;
          buffer[index++] = (scopeDocSize >> 16) & 0xff;
          buffer[index++] = (scopeDocSize >> 24) & 0xff;     
          
          // Write the scopeObject into the buffer
          scopeObjectBuffer.copy(buffer, index, 0, scopeSize);

          // Adjust index, removing the empty size of the doc (5 bytes 0000000005)
          index = index + scopeDocSize - 5;          
          // Write trailing zero
          buffer[index++] = 0;
          return index
        } else {
          buffer[index++] = BSON.BSON_DATA_CODE;
          // Encode the name
          index = index + buffer.write(name, index, 'utf8') + 1;
          buffer[index - 1] = 0;
          // Function string
          var functionString = value.code.toString();
          // Function Size
          var size = Buffer.byteLength(functionString) + 1;
          // Write the size of the string to buffer
          buffer[index++] = size & 0xff;
          buffer[index++] = (size >> 8) & 0xff;
          buffer[index++] = (size >> 16) & 0xff;
          buffer[index++] = (size >> 24) & 0xff;     
          // Write the string
          buffer.write(functionString, index, 'utf8');
          // Update index
          index = index + size - 1;
          // Write zero
          buffer[index++] = 0;          
          return index;
        }                              
      } else if(value === null || value instanceof MinKey || value instanceof MaxKey) {
        // Write the type of either min or max key
        if(value === null) {
          buffer[index++] = BSON.BSON_DATA_NULL;
        } else if(value instanceof MinKey) {
          buffer[index++] = BSON.BSON_DATA_MIN_KEY;
        } else {
          buffer[index++] = BSON.BSON_DATA_MAX_KEY;
        }
        
        // Encode the name
        index = index + buffer.write(name, index, 'utf8') + 1;
        buffer[index - 1] = 0;
        return index;
      } else if(value instanceof Binary) {
        // Write the type
        buffer[index++] = BSON.BSON_DATA_BINARY;
        // Encode the name
        index = index + buffer.write(name, index, 'utf8') + 1;
        buffer[index - 1] = 0;
        // Extract the buffer
        var data = value.value(true);        
        // Calculate size
        var size = value.position;
        // Write the size of the string to buffer
        buffer[index++] = size & 0xff;
        buffer[index++] = (size >> 8) & 0xff;
        buffer[index++] = (size >> 16) & 0xff;
        buffer[index++] = (size >> 24) & 0xff;     
        // Write the subtype to the buffer
        buffer[index++] = value.sub_type;
        // Write the data to the object
        data.copy(buffer, index, 0, value.position);
        // Ajust index
        index = index + value.position;
        return index;
      } else if(value instanceof Symbol) {
        // Write the type
        buffer[index++] = BSON.BSON_DATA_SYMBOL;
        // Encode the name
        index = index + buffer.write(name, index, 'utf8') + 1;
        buffer[index - 1] = 0;
        // Calculate size
        size = Buffer.byteLength(value.value) + 1;
        // Write the size of the string to buffer
        buffer[index++] = size & 0xff;
        buffer[index++] = (size >> 8) & 0xff;
        buffer[index++] = (size >> 16) & 0xff;
        buffer[index++] = (size >> 24) & 0xff;     
        // Write the string
        buffer.write(value.value, index, 'utf8');
        // Update index
        index = index + size - 1;
        // Write zero
        buffer[index++] = 0x00;
        return index;        
      } else if(value instanceof DBRef) {
        // Write the type
        buffer[index++] = BSON.BSON_DATA_OBJECT;
        // Encode the name
        index = index + buffer.write(name, index, 'utf8') + 1;
        buffer[index - 1] = 0;
        // Set up correct object for serialization
        var ordered_values = {
            '$ref': value.namespace
          , '$id' : value.oid
        };
    
        // Add db reference if it exists
        if(null != value.db) {
          ordered_values['$db'] = value.db;
        }

        // Message size
        var size = calculateObjectSize(ordered_values);
        // Serialize the object
        var endIndex = serializeWithBufferAndIndex(ordered_values, checkKeys, buffer, index, serializeFunctions);
        // Write the size of the string to buffer
        buffer[index++] = size & 0xff;
        buffer[index++] = (size >> 8) & 0xff;
        buffer[index++] = (size >> 16) & 0xff;
        buffer[index++] = (size >> 24) & 0xff;     
        // Write zero for object
        buffer[endIndex++] = 0x00;
        // Return the end index
        return endIndex;
      } else if(value instanceof RegExp || toString.call(value) === '[object RegExp]') {
        // Write the type
        buffer[index++] = BSON.BSON_DATA_REGEXP;
        // Encode the name
        index = index + buffer.write(name, index, 'utf8') + 1;
        buffer[index - 1] = 0;

        // Write the regular expression string
        buffer.write(value.source, index, 'utf8');
        // Adjust the index
        index = index + Buffer.byteLength(value.source);
        // Write zero
        buffer[index++] = 0x00;        
        // Write the parameters
        if(value.global) buffer[index++] = 0x73; // s
        if(value.ignoreCase) buffer[index++] = 0x69; // i
        if(value.multiline) buffer[index++] = 0x6d; // m
        // Add ending zero
        buffer[index++] = 0x00;
        return index;
      } else {
        // Write the type
        buffer[index++] = Array.isArray(value) ? BSON.BSON_DATA_ARRAY : BSON.BSON_DATA_OBJECT;
        // Encode the name
        index = index + buffer.write(name, index, 'utf8') + 1;
        buffer[index - 1] = 0;
        // Serialize the object
        var endIndex = serializeObject(value, checkKeys, buffer, index + 4, serializeFunctions);
        // Write size
        var size = endIndex - index;
        // Write the size of the string to buffer
        buffer[index++] = size & 0xff;
        buffer[index++] = (size >> 8) & 0xff;
        buffer[index++] = (size >> 16) & 0xff;
        buffer[index++] = (size >> 24) & 0xff;     
        return endIndex;
      }
    case 'function':
      // WTF for 0.4.X where typeof /someregexp/ === 'function'
      if(value instanceof RegExp || toString.call(value) === '[object RegExp]') {        
        // Write the type
        buffer[index++] = BSON.BSON_DATA_REGEXP;
        // Encode the name
        index = index + buffer.write(name, index, 'utf8') + 1;
        buffer[index - 1] = 0;

        // Write the regular expression string
        buffer.write(value.source, index, 'utf8');
        // Adjust the index
        index = index + Buffer.byteLength(value.source);
        // Write zero
        buffer[index++] = 0x00;        
        // Write the parameters
        if(value.global) buffer[index++] = 0x73; // s
        if(value.ignoreCase) buffer[index++] = 0x69; // i
        if(value.multiline) buffer[index++] = 0x6d; // m
        // Add ending zero
        buffer[index++] = 0x00;
        return index;
      } else {
        if(serializeFunctions && value.scope != null && Object.keys(value.scope).length > 0) {
          // Write the type
          buffer[index++] = BSON.BSON_DATA_CODE_W_SCOPE;
          // Encode the name
          index = index + buffer.write(name, index, 'utf8') + 1;
          buffer[index - 1] = 0;
          // Calculate the scope size
          var scopeSize = BSON.calculateObjectSize(value.scope);
          // Function string
          var functionString = value.toString();
          // Function Size
          var codeSize = Buffer.byteLength(functionString) + 1;

          // Calculate full size of the object
          var totalSize = 4 + codeSize + scopeSize;

          // Write the total size of the object
          buffer[index++] = totalSize & 0xff;
          buffer[index++] = (totalSize >> 8) & 0xff;
          buffer[index++] = (totalSize >> 16) & 0xff;
          buffer[index++] = (totalSize >> 24) & 0xff;     

          // Write the size of the string to buffer
          buffer[index++] = codeSize & 0xff;
          buffer[index++] = (codeSize >> 8) & 0xff;
          buffer[index++] = (codeSize >> 16) & 0xff;
          buffer[index++] = (codeSize >> 24) & 0xff;     

          // Write the string
          buffer.write(functionString, index, 'utf8');
          // Update index
          index = index + codeSize - 1;
          // Write zero
          buffer[index++] = 0;
          // Serialize the scope object          
          var scopeObjectBuffer = new Buffer(scopeSize);
          // Execute the serialization into a seperate buffer
          serializeObject(value.scope, checkKeys, scopeObjectBuffer, 0, serializeFunctions);

          // Adjusted scope Size (removing the header)
          var scopeDocSize = scopeSize - 4;
          // Write scope object size
          buffer[index++] = scopeDocSize & 0xff;
          buffer[index++] = (scopeDocSize >> 8) & 0xff;
          buffer[index++] = (scopeDocSize >> 16) & 0xff;
          buffer[index++] = (scopeDocSize >> 24) & 0xff;     

          // Write the scopeObject into the buffer
          scopeObjectBuffer.copy(buffer, index, 0, scopeSize);

          // Adjust index, removing the empty size of the doc (5 bytes 0000000005)
          index = index + scopeDocSize - 5;          
          // Write trailing zero
          buffer[index++] = 0;
          return index
        } else if(serializeFunctions) {
          buffer[index++] = BSON.BSON_DATA_CODE;
          // Encode the name
          index = index + buffer.write(name, index, 'utf8') + 1;
          buffer[index - 1] = 0;
          // Function string
          var functionString = value.toString();
          // Function Size
          var size = Buffer.byteLength(functionString) + 1;
          // Write the size of the string to buffer
          buffer[index++] = size & 0xff;
          buffer[index++] = (size >> 8) & 0xff;
          buffer[index++] = (size >> 16) & 0xff;
          buffer[index++] = (size >> 24) & 0xff;     
          // Write the string
          buffer.write(functionString, index, 'utf8');
          // Update index
          index = index + size - 1;
          // Write zero
          buffer[index++] = 0;          
          return index;
        }        
      }
  }
  
  // If no value to serialize
  return index;  
}

BSON.serialize = function(object, checkKeys, asBuffer, serializeFunctions) {
  var buffer = new Buffer(BSON.calculateObjectSize(object, serializeFunctions));
  BSON.serializeWithBufferAndIndex(object, checkKeys, buffer, 0, serializeFunctions);
  return buffer;
}

//
// Contains the function cache if we have that enable to allow for avoiding the eval step on each
// deserialization, comparison is by md5
//
var functionCache = BSON.functionCache = {};

// Crc state variables shared by function
// var table = "00000000 77073096 EE0E612C 990951BA 076DC419 706AF48F E963A535 9E6495A3 0EDB8832 79DCB8A4 E0D5E91E 97D2D988 09B64C2B 7EB17CBD E7B82D07 90BF1D91 1DB71064 6AB020F2 F3B97148 84BE41DE 1ADAD47D 6DDDE4EB F4D4B551 83D385C7 136C9856 646BA8C0 FD62F97A 8A65C9EC 14015C4F 63066CD9 FA0F3D63 8D080DF5 3B6E20C8 4C69105E D56041E4 A2677172 3C03E4D1 4B04D447 D20D85FD A50AB56B 35B5A8FA 42B2986C DBBBC9D6 ACBCF940 32D86CE3 45DF5C75 DCD60DCF ABD13D59 26D930AC 51DE003A C8D75180 BFD06116 21B4F4B5 56B3C423 CFBA9599 B8BDA50F 2802B89E 5F058808 C60CD9B2 B10BE924 2F6F7C87 58684C11 C1611DAB B6662D3D 76DC4190 01DB7106 98D220BC EFD5102A 71B18589 06B6B51F 9FBFE4A5 E8B8D433 7807C9A2 0F00F934 9609A88E E10E9818 7F6A0DBB 086D3D2D 91646C97 E6635C01 6B6B51F4 1C6C6162 856530D8 F262004E 6C0695ED 1B01A57B 8208F4C1 F50FC457 65B0D9C6 12B7E950 8BBEB8EA FCB9887C 62DD1DDF 15DA2D49 8CD37CF3 FBD44C65 4DB26158 3AB551CE A3BC0074 D4BB30E2 4ADFA541 3DD895D7 A4D1C46D D3D6F4FB 4369E96A 346ED9FC AD678846 DA60B8D0 44042D73 33031DE5 AA0A4C5F DD0D7CC9 5005713C 270241AA BE0B1010 C90C2086 5768B525 206F85B3 B966D409 CE61E49F 5EDEF90E 29D9C998 B0D09822 C7D7A8B4 59B33D17 2EB40D81 B7BD5C3B C0BA6CAD EDB88320 9ABFB3B6 03B6E20C 74B1D29A EAD54739 9DD277AF 04DB2615 73DC1683 E3630B12 94643B84 0D6D6A3E 7A6A5AA8 E40ECF0B 9309FF9D 0A00AE27 7D079EB1 F00F9344 8708A3D2 1E01F268 6906C2FE F762575D 806567CB 196C3671 6E6B06E7 FED41B76 89D32BE0 10DA7A5A 67DD4ACC F9B9DF6F 8EBEEFF9 17B7BE43 60B08ED5 D6D6A3E8 A1D1937E 38D8C2C4 4FDFF252 D1BB67F1 A6BC5767 3FB506DD 48B2364B D80D2BDA AF0A1B4C 36034AF6 41047A60 DF60EFC3 A867DF55 316E8EEF 4669BE79 CB61B38C BC66831A 256FD2A0 5268E236 CC0C7795 BB0B4703 220216B9 5505262F C5BA3BBE B2BD0B28 2BB45A92 5CB36A04 C2D7FFA7 B5D0CF31 2CD99E8B 5BDEAE1D 9B64C2B0 EC63F226 756AA39C 026D930A 9C0906A9 EB0E363F 72076785 05005713 95BF4A82 E2B87A14 7BB12BAE 0CB61B38 92D28E9B E5D5BE0D 7CDCEFB7 0BDBDF21 86D3D2D4 F1D4E242 68DDB3F8 1FDA836E 81BE16CD F6B9265B 6FB077E1 18B74777 88085AE6 FF0F6A70 66063BCA 11010B5C 8F659EFF F862AE69 616BFFD3 166CCF45 A00AE278 D70DD2EE 4E048354 3903B3C2 A7672661 D06016F7 4969474D 3E6E77DB AED16A4A D9D65ADC 40DF0B66 37D83BF0 A9BCAE53 DEBB9EC5 47B2CF7F 30B5FFE9 BDBDF21C CABAC28A 53B39330 24B4A3A6 BAD03605 CDD70693 54DE5729 23D967BF B3667A2E C4614AB8 5D681B02 2A6F2B94 B40BBE37 C30C8EA1 5A05DF1B 2D02EF8D".split(" ");
var table = [0x00000000, 0x77073096, 0xEE0E612C, 0x990951BA, 0x076DC419, 0x706AF48F, 0xE963A535, 0x9E6495A3, 0x0EDB8832, 0x79DCB8A4, 0xE0D5E91E, 0x97D2D988, 0x09B64C2B, 0x7EB17CBD, 0xE7B82D07, 0x90BF1D91, 0x1DB71064, 0x6AB020F2, 0xF3B97148, 0x84BE41DE, 0x1ADAD47D, 0x6DDDE4EB, 0xF4D4B551, 0x83D385C7, 0x136C9856, 0x646BA8C0, 0xFD62F97A, 0x8A65C9EC, 0x14015C4F, 0x63066CD9, 0xFA0F3D63, 0x8D080DF5, 0x3B6E20C8, 0x4C69105E, 0xD56041E4, 0xA2677172, 0x3C03E4D1, 0x4B04D447, 0xD20D85FD, 0xA50AB56B, 0x35B5A8FA, 0x42B2986C, 0xDBBBC9D6, 0xACBCF940, 0x32D86CE3, 0x45DF5C75, 0xDCD60DCF, 0xABD13D59, 0x26D930AC, 0x51DE003A, 0xC8D75180, 0xBFD06116, 0x21B4F4B5, 0x56B3C423, 0xCFBA9599, 0xB8BDA50F, 0x2802B89E, 0x5F058808, 0xC60CD9B2, 0xB10BE924, 0x2F6F7C87, 0x58684C11, 0xC1611DAB, 0xB6662D3D, 0x76DC4190, 0x01DB7106, 0x98D220BC, 0xEFD5102A, 0x71B18589, 0x06B6B51F, 0x9FBFE4A5, 0xE8B8D433, 0x7807C9A2, 0x0F00F934, 0x9609A88E, 0xE10E9818, 0x7F6A0DBB, 0x086D3D2D, 0x91646C97, 0xE6635C01, 0x6B6B51F4, 0x1C6C6162, 0x856530D8, 0xF262004E, 0x6C0695ED, 0x1B01A57B, 0x8208F4C1, 0xF50FC457, 0x65B0D9C6, 0x12B7E950, 0x8BBEB8EA, 0xFCB9887C, 0x62DD1DDF, 0x15DA2D49, 0x8CD37CF3, 0xFBD44C65, 0x4DB26158, 0x3AB551CE, 0xA3BC0074, 0xD4BB30E2, 0x4ADFA541, 0x3DD895D7, 0xA4D1C46D, 0xD3D6F4FB, 0x4369E96A, 0x346ED9FC, 0xAD678846, 0xDA60B8D0, 0x44042D73, 0x33031DE5, 0xAA0A4C5F, 0xDD0D7CC9, 0x5005713C, 0x270241AA, 0xBE0B1010, 0xC90C2086, 0x5768B525, 0x206F85B3, 0xB966D409, 0xCE61E49F, 0x5EDEF90E, 0x29D9C998, 0xB0D09822, 0xC7D7A8B4, 0x59B33D17, 0x2EB40D81, 0xB7BD5C3B, 0xC0BA6CAD, 0xEDB88320, 0x9ABFB3B6, 0x03B6E20C, 0x74B1D29A, 0xEAD54739, 0x9DD277AF, 0x04DB2615, 0x73DC1683, 0xE3630B12, 0x94643B84, 0x0D6D6A3E, 0x7A6A5AA8, 0xE40ECF0B, 0x9309FF9D, 0x0A00AE27, 0x7D079EB1, 0xF00F9344, 0x8708A3D2, 0x1E01F268, 0x6906C2FE, 0xF762575D, 0x806567CB, 0x196C3671, 0x6E6B06E7, 0xFED41B76, 0x89D32BE0, 0x10DA7A5A, 0x67DD4ACC, 0xF9B9DF6F, 0x8EBEEFF9, 0x17B7BE43, 0x60B08ED5, 0xD6D6A3E8, 0xA1D1937E, 0x38D8C2C4, 0x4FDFF252, 0xD1BB67F1, 0xA6BC5767, 0x3FB506DD, 0x48B2364B, 0xD80D2BDA, 0xAF0A1B4C, 0x36034AF6, 0x41047A60, 0xDF60EFC3, 0xA867DF55, 0x316E8EEF, 0x4669BE79, 0xCB61B38C, 0xBC66831A, 0x256FD2A0, 0x5268E236, 0xCC0C7795, 0xBB0B4703, 0x220216B9, 0x5505262F, 0xC5BA3BBE, 0xB2BD0B28, 0x2BB45A92, 0x5CB36A04, 0xC2D7FFA7, 0xB5D0CF31, 0x2CD99E8B, 0x5BDEAE1D, 0x9B64C2B0, 0xEC63F226, 0x756AA39C, 0x026D930A, 0x9C0906A9, 0xEB0E363F, 0x72076785, 0x05005713, 0x95BF4A82, 0xE2B87A14, 0x7BB12BAE, 0x0CB61B38, 0x92D28E9B, 0xE5D5BE0D, 0x7CDCEFB7, 0x0BDBDF21, 0x86D3D2D4, 0xF1D4E242, 0x68DDB3F8, 0x1FDA836E, 0x81BE16CD, 0xF6B9265B, 0x6FB077E1, 0x18B74777, 0x88085AE6, 0xFF0F6A70, 0x66063BCA, 0x11010B5C, 0x8F659EFF, 0xF862AE69, 0x616BFFD3, 0x166CCF45, 0xA00AE278, 0xD70DD2EE, 0x4E048354, 0x3903B3C2, 0xA7672661, 0xD06016F7, 0x4969474D, 0x3E6E77DB, 0xAED16A4A, 0xD9D65ADC, 0x40DF0B66, 0x37D83BF0, 0xA9BCAE53, 0xDEBB9EC5, 0x47B2CF7F, 0x30B5FFE9, 0xBDBDF21C, 0xCABAC28A, 0x53B39330, 0x24B4A3A6, 0xBAD03605, 0xCDD70693, 0x54DE5729, 0x23D967BF, 0xB3667A2E, 0xC4614AB8, 0x5D681B02, 0x2A6F2B94, 0xB40BBE37, 0xC30C8EA1, 0x5A05DF1B, 0x2D02EF8D];

// CRC32 hash method
// Fast and enough versitility for our usage
var crc32 =  function(string, start, end) {
  var crc = 0
  var x = 0;
  var y = 0;
  crc = crc ^ (-1);

  for(var i = start, iTop = end; i < iTop;i++) {
  	y = (crc ^ string[i]) & 0xFF;
    x = table[y];
  	crc = (crc >>> 8) ^ x;
  }
  
  return crc ^ (-1);
}

/**
 * Deserialize stream `data` as BSON documents.
 *
 * @param {TODO} data
 * @param {TODO} options
 * @return {TODO}
 */ 
BSON.deserializeStream = function(data, startIndex, numberOfDocuments, documents, docStartIndex, options) {  
  // if(numberOfDocuments !== documents.length) throw new Error("Number of expected results back is less than the number of documents");
  options = options != null ? options : {};
  var index = startIndex;
  // Loop over all documents
  for(var i = 0; i < numberOfDocuments; i++) {
    // Find size of the document
    var size = data[index] | data[index + 1] << 8 | data[index + 2] << 16 | data[index + 3] << 24;
    // Update options with index
    options['index'] = index; 
    // Parse the document at this point
    documents[docStartIndex + i] = BSON.deserialize(data, options);
    // Adjust index by the document size
    index = index + size;
  }
  
  // Return object containing end index of parsing and list of documents
  return index;
}

/**
 * Deserialize `data` as BSON.
 *
 * @param {TODO} data
 * @param {TODO} options
 * @return {TODO}
 */ 
BSON.deserialize = function(buffer, options) {  
  // Options
  options = options == null ? {} : options;
  var evalFunctions = options['evalFunctions'] == null ? false : options['evalFunctions'];
  var cacheFunctions = options['cacheFunctions'] == null ? false : options['cacheFunctions'];
  var cacheFunctionsCrc32 = options['cacheFunctionsCrc32'] == null ? false : options['cacheFunctionsCrc32'];
  // Set up index
  var index = typeof options['index'] == 'number' ? options['index'] : 0;
  // Parse the elements
  var parseElements = function(buffer, isArray, options) {
    // Reads in a C style string
    var readCStyleString = function() {
      // console.log("=========================== readCStyleString :: 0 :: " + index)
      // Get the start search index
      var i = index;
      // Locate the end of the c string
      while(buffer[i] !== 0x00) { i++ }    
      // Grab utf8 encoded string
      var string = buffer.toString('utf8', index, i);
      // Update index position
      index = i + 1;
      // console.log("=========================== readCStyleString :: 1 :: " + index + " :: " + string)
      // Return string
      return string;
    }

    // Create holding object
    var object = isArray ? [] : {};

    // Read the document size
    var size = buffer[index++] | buffer[index++] << 8 | buffer[index++] << 16 | buffer[index++] << 24;

    // While we have more left data left keep parsing
    while(true) {
      // Read the type
      var elementType = buffer[index++];
      // If we get a zero it's the last byte, exit
      if(elementType == 0) break;
      // Read the name of the field
      var name = readCStyleString();
      // Switch on the type
      switch(elementType) {
        case BSON.BSON_DATA_OID:
          // Decode the oid
          object[name] = new ObjectID(buffer.toString('binary', index, index + 12));
          // Update index
          index = index + 12;
          break;          
        case BSON.BSON_DATA_STRING:
          // Read the content of the field
          var stringSize = buffer[index++] | buffer[index++] << 8 | buffer[index++] << 16 | buffer[index++] << 24;
          // Add string to object
          object[name] = buffer.toString('utf8', index, index + stringSize - 1);
          // Update parse index position
          index = index + stringSize;
          break;
        case BSON.BSON_DATA_INT:
          // Decode the 32bit value
          object[name] = buffer[index++] | buffer[index++] << 8 | buffer[index++] << 16 | buffer[index++] << 24;
          break;
        case BSON.BSON_DATA_NUMBER:
          // Decode the double value
          object[name] = ieee754.readIEEE754(buffer, index, 'little', 52, 8);
          // Update the index
          index = index + 8;
          break;
        case BSON.BSON_DATA_DATE:
          // Unpack the low and high bits
          var lowBits = buffer[index++] | buffer[index++] << 8 | buffer[index++] << 16 | buffer[index++] << 24;
          var highBits = buffer[index++] | buffer[index++] << 8 | buffer[index++] << 16 | buffer[index++] << 24;
          // Set date object
          object[name] = new Date(new Long(lowBits, highBits).toNumber());
          break;
        case BSON.BSON_DATA_BOOLEAN:
          // Parse the boolean value
          object[name] = buffer[index++] == 1;
          break;
        case BSON.BSON_DATA_NULL:
          // Parse the boolean value
          object[name] = null;
          break;
        case BSON.BSON_DATA_BINARY:
          // Decode the size of the binary blob
          var binarySize = buffer[index++] | buffer[index++] << 8 | buffer[index++] << 16 | buffer[index++] << 24;
          // Decode the subtype
          var subType = buffer[index++];
          // Decode as raw Buffer object if options specifies it
          object[name] = new Binary(buffer.slice(index, index + binarySize), subType);
          // Update the index
          index = index + binarySize;
          break;
        case BSON.BSON_DATA_ARRAY:
          // Parse the object
          object[name] = parseElements(buffer, true, options);
          // Return
          break;
        case BSON.BSON_DATA_OBJECT:
          // Parse the object
          object[name] = parseElements(buffer, false, options);
          // Return
          break;
        case BSON.BSON_DATA_REGEXP:
          // Create the regexp
          var source = readCStyleString();
          var regExpOptions = readCStyleString();
          // For each option add the corresponding one for javascript
          var optionsArray = new Array(regExpOptions.length);

          // Parse options
          for(var i = 0; i < regExpOptions.length; i++) {
            switch(regExpOptions[i]) {
              case 'm':
                optionsArray[i] = 'm';
                break;
              case 's':
                optionsArray[i] = 'g';
                break;
              case 'i':
                optionsArray[i] = 'i';
                break;                
            }
          }
          
          object[name] = new RegExp(source, optionsArray.join(''));
          break;        
        case BSON.BSON_DATA_LONG:
          // Unpack the low and high bits
          var lowBits = buffer[index++] | buffer[index++] << 8 | buffer[index++] << 16 | buffer[index++] << 24;
          var highBits = buffer[index++] | buffer[index++] << 8 | buffer[index++] << 16 | buffer[index++] << 24;
          // Create long object
          var long = new Long(lowBits, highBits);
          // Set the object
          object[name] = long.lessThanOrEqual(JS_INT_MAX_LONG) && long.greaterThanOrEqual(JS_INT_MIN_LONG) ? long.toNumber() : long;
          break;
        case BSON.BSON_DATA_SYMBOL:
          // Read the content of the field
          var stringSize = buffer[index++] | buffer[index++] << 8 | buffer[index++] << 16 | buffer[index++] << 24;
          // Add string to object
          object[name] = new Symbol(buffer.toString('utf8', index, index + stringSize - 1));
          // Update parse index position
          index = index + stringSize;
          break;
        case BSON.BSON_DATA_TIMESTAMP:
          // Unpack the low and high bits
          var lowBits = buffer[index++] | buffer[index++] << 8 | buffer[index++] << 16 | buffer[index++] << 24;
          var highBits = buffer[index++] | buffer[index++] << 8 | buffer[index++] << 16 | buffer[index++] << 24;
          // Set the object
          object[name] = new Timestamp(lowBits, highBits);
          break;
        case BSON.BSON_DATA_MIN_KEY:
          // Parse the object
          object[name] = new MinKey();
          break;
        case BSON.BSON_DATA_MAX_KEY:
          // Parse the object
          object[name] = new MaxKey();
          break;
        case BSON.BSON_DATA_CODE:
          // Read the content of the field
          var stringSize = buffer[index++] | buffer[index++] << 8 | buffer[index++] << 16 | buffer[index++] << 24;
          // Function string
          var functionString = buffer.toString('utf8', index, index + stringSize - 1);
          
          // If we are evaluating the functions
          if(evalFunctions) {
            // Contains the value we are going to set
            var value = null;            
            // If we have cache enabled let's look for the md5 of the function in the cache        
            if(cacheFunctions) {
              var hash = cacheFunctionsCrc32 ? crc32(functionString) : functionString;
              // Check for cache hit, eval if missing and return cached function
              if(functionCache[hash] == null) {            
                eval("value = " + functionString);          
                functionCache[hash] = value;
              }
              // Set the object
              object[name] = functionCache[hash].bind(object);
            } else {
              // Set directly
              eval("value = " + functionString);          
              object[name] = value;
            }
          } else {
            object[name]  = new Code(functionString, {});
          }
                    
          // Update parse index position
          index = index + stringSize;
          break;
        case BSON.BSON_DATA_CODE_W_SCOPE:
          // Read the content of the field
          var totalSize = buffer[index++] | buffer[index++] << 8 | buffer[index++] << 16 | buffer[index++] << 24;
          var stringSize = buffer[index++] | buffer[index++] << 8 | buffer[index++] << 16 | buffer[index++] << 24;
          // Javascript function
          var functionString = buffer.toString('utf8', index, index + stringSize - 1);
          // Update parse index position
          index = index + stringSize;
          // Decode the scope object
          var scopeObject = parseElements(buffer, false, options);

          // If we are evaluating the functions
          if(evalFunctions) {
            // Contains the value we are going to set
            var value = null;            
            // If we have cache enabled let's look for the md5 of the function in the cache        
            if(cacheFunctions) {
              var hash = cacheFunctionsCrc32 ? crc32(functionString) : functionString;
              // Check for cache hit, eval if missing and return cached function
              if(functionCache[hash] == null) {            
                eval("value = " + functionString);          
                functionCache[hash] = value;
              }

              // Set the function object
              object[name] = functionCache[hash].bind(object);
            } else {
              // Set directly
              eval("value = " + functionString);          
              object[name] = value;
            }

            // Set the scope on the object
            object[name].scope = scopeObject;
          } else {
            object[name]  = new Code(functionString, scopeObject);
          }

          // Add string to object
          break;
      }
    }
    
    // Check if we have a db ref object
    if(object['$id'] != null) object = new DBRef(object['$ref'], object['$id'], object['$db']);

    // Return the final objects
    return object;
  }

  return parseElements(buffer, false, options);
}
 
/**
 * Check if key name is valid.
 *
 * @param {TODO} key
 */
BSON.checkKey = function checkKey (key) {
  if (!key.length) return;

  // Check if we have a legal key for the object
  if ('$' == key[0]) {
    throw Error("key " + key + " must not start with '$'");
  } else if (!!~key.indexOf('.')) {
    throw Error("key " + key + " must not contain '.'");
  }
};

/** 
 * Set up instance methods
 */
BSON.prototype.deserialize = function(data, options) {
  return BSON.deserialize(data, options);
}

/** 
 * Set up instance methods
 */
BSON.prototype.deserialize2 = function(data, options) {
  return BSON.deserialize2(data, options);
}

BSON.prototype.deserializeStream = function(data, startIndex, numberOfDocuments, documents, docStartIndex, options) {
  return BSON.deserializeStream(data, startIndex, numberOfDocuments, documents, docStartIndex, options);
}

BSON.prototype.serialize = function(object, checkKeys, asBuffer, serializeFunctions) {
  return BSON.serialize(object, checkKeys, asBuffer, serializeFunctions);
}

BSON.prototype.calculateObjectSize = function(object, serializeFunctions) {
  return BSON.calculateObjectSize(object, serializeFunctions);
}

BSON.prototype.serializeWithBufferAndIndex = function(object, checkKeys, buffer, startIndex, serializeFunctions) {
  return BSON.serializeWithBufferAndIndex(object, checkKeys, buffer, startIndex, serializeFunctions);
}

/**
 * Expose all objects
 */
exports.Code = Code;
exports.Symbol = Symbol;
exports.BSON = BSON;
exports.DBRef = DBRef;
exports.Binary = Binary;
exports.ObjectID = ObjectID;
exports.Long = Long;
exports.Timestamp = Timestamp;
exports.Double = Double;
exports.MinKey = MinKey;
exports.MaxKey = MaxKey;
