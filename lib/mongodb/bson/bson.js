/**
 * Module dependencies.
 */
var BinaryParser = require('./binary_parser').BinaryParser
  , Long = require('../goog/math/long').Long
  , Double = require('./double').Double
  , Timestamp = require('./timestamp').Timestamp
  , ObjectID = require('./objectid').ObjectID
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
BSON.BSON_INT32_MIN = -0x80000000;

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

// Does not do recursion, uses a stack to handle depth
// Experiment for performance
BSON.calculateObjectSize = function(object, serializeFunctions) {
  var totalLength = (4 + 1);
  var done = false;
  var stack = new Array(32);
  var currentObject = object;
  var keys = null;
  var keysIndex = 0;
  var stackIndex = 0;
  var keyLength = Object.keys(object).length;
  // Controls the flow
  var finished = false;  
  // Ensure serialized functions set
  serializeFunctions = serializeFunctions == null ? false : serializeFunctions;

  while(!done) {
    // Only get keys if we have a new object
    keys = keys == null ? Object.keys(currentObject) : keys;

    // Let's process all the elements
    while(keysIndex < keyLength) {
      var name = keys[keysIndex++];
      var value = currentObject[name];
      
      if(value == null | value instanceof MinKey || value instanceof MaxKey) {
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (1);
      } else if(typeof value == 'string') {
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (Buffer.byteLength(value, 'utf8') + 4 + 1 + 1);
      } else if(Array.isArray(value)) {
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (4 + 1) + 1;
        stack[stackIndex++] = ({keys:keys, object:currentObject, keysIndex:keysIndex});
        currentObject = value;
        keys = Object.keys(value)
        keysIndex = 0;
        keyLength = keys.length;
      } else if((typeof value == 'number' || toString.call(value) === '[object Number]') &&
                value === parseInt(value, 10) &&
                value.toString().match(/\./) == null) {                    
        // Write the type
        var int64 = value >= BSON.BSON_INT32_MAX || value < BSON.BSON_INT32_MIN;
        
        if(int64) {                         
          // Write the number
          var long = Long.fromNumber(value);
          // If the number is the same after long conversion force double
          if(value.toString() == long.toNumber().toString() || value >= Long.MAX_VALUE || value <= Long.MIN_VALUE) {
            totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (8 + 1);
            // Ajust index
            index = index + 8;              
          } else {
            totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (8 + 1);
          }
        } else {                
          totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (4 + 1);
        }
      } else if(typeof value == 'number' || toString.call(value) === '[object Number]' ||
                value instanceof Double) {
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (8 + 1);
      } else if(typeof value == 'boolean' || toString.call(value) === '[object Boolean]') {
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (1 + 1);
      } else if(value instanceof Date || toString.call(value) === '[object Date]') {
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (8 + 1);
      } else if(value instanceof ObjectID || (value.id && value.toHexString)) {
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (12 + 1);
      } else if(value instanceof Binary) {
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (value.position + 1 + 4 + 1);
      } else if(value instanceof Long || value instanceof Double || value instanceof Timestamp) {
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (8 + 1);
      } else if(value instanceof RegExp || toString.call(value) === '[object RegExp]') {
        // Keep list of valid options
        var options_array = [];
        var str = value.toString();
        var clean_regexp = str.match(/\/.*\//, '');
        clean_regexp = clean_regexp[0].substring(1, clean_regexp[0].length - 1);
        var options = str.substr(clean_regexp.length + 2);

        // Extract all options that are legal and sort them alphabetically
        for(var index = 0, len = options.length; index < len; ++index) {
          var chr = options.charAt(index);
          if('i' == chr || 'm' == chr || 'x' == chr) {
            options_array.push(chr);
          }
        }

        // Calculate the total length
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (Buffer.byteLength(clean_regexp) + 1 + options_array.length + 1 + 1);
      } else if(value instanceof DBRef) {
        var ordered_values = {
            '$ref': value.namespace
          , '$id' : value.oid
        };

        if(null != value.db) {
          ordered_values['$db'] = value.db;
        }

        // Calculate the object
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (4 + 1 + 1);
        stack[stackIndex++] = ({keys:keys, object:currentObject, keysIndex:keysIndex});
        currentObject = ordered_values;
        keys = Object.keys(ordered_values)
        keysIndex = 0;
        keyLength = keys.length;
      } else if(value instanceof Code && Object.keys(value.scope).length == 0) {
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (Buffer.byteLength(value.code.toString(), 'utf8') + 4 + 1 + 1);
      } else if(value instanceof Code) {
        // Calculate the length of the code string
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + 4 + (Buffer.byteLength(value.code.toString(), 'utf8') + 1) + 4;
        totalLength += (4 + 1 + 1);
        // Push the current object
        stack[stackIndex++] = ({keys:keys, object:currentObject, keysIndex:keysIndex});
        currentObject = value.scope;        
        keys = Object.keys(value.scope)
        keysIndex = 0;
        keyLength = keys.length;
      } else if(value instanceof Symbol) {
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (Buffer.byteLength(value.value, 'utf8') + 4 + 1 + 1);
      } else if(typeof value == 'function' && serializeFunctions) {
        // Calculate the length of the code string
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + 4 + (Buffer.byteLength(value.toString(), 'utf8') + 1 + 1);
      } else if(typeof value == 'object') {
        // Calculate the object
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (4 + 1 + 1);
        // Otherwise handle keys
        stack[stackIndex++] = ({keys:keys, object:currentObject, keysIndex:keysIndex});
        currentObject = value;
        keys = Object.keys(value)
        keysIndex = 0;
        keyLength = keys.length;
      }

      // Finished up the object
      if(keysIndex == keyLength) {
        finished = true;
      }
    }

    // If the stack is empty let's finish up, otherwise pop the previous object and
    // continue
    if(stackIndex == 0) {
      done = true;
    } else if(finished || (keysIndex == keyLength)){      
      var currentObjectStored = stack[--stackIndex];
      currentObject = currentObjectStored.object;
      keysIndex = currentObjectStored.keysIndex;
      keys = currentObjectStored.keys;
      keyLength = keys.length;
      finished = (keyLength - 1) == keysIndex;
    }
  }

  return totalLength;
}

// In place serialization with index to starting point of serialization
BSON.serializeWithBufferAndIndex = function serializeWithBufferAndIndex(object, checkKeys, buffer, startIndex, serializeFunctions) {
  if(null != object && 'object' === typeof object) {
    // Encode the object using single allocated buffer and no recursion
    var index = startIndex == null ? 0 : startIndex;
    var done = false;
    var stack = new Array(32);
    var currentObject = object;
    var keys = null;
    var keysIndex = 0;
    var stackIndex = 0;
    var keyLength = Object.keys(object).length;
    var size = 0;
    var objectIndex = 0;
    var totalNumberOfObjects = 0;
    // Special index for Code objects
    var codeStartIndex = 0;
    // Signals if we are finished up
    var finished = false;  
    // Ensure serialized functions set
    serializeFunctions = serializeFunctions == null ? false : serializeFunctions;

    // Current parsing object state
    var currentObjectStored = {object: object, index: index, endIndex: 0, keys: Object.keys(object), keysIndex:keysIndex, keyLength:keyLength};  
  	// Adjust the index
  	index = index + 4;

    // While meeting
    while(!done) {
      // While current object has keys
      while(keysIndex < keyLength) {
        var name = currentObjectStored.keys[keysIndex++];
        var value = currentObjectStored.object[name];

        // If we got a key check for valid type
        if(name != null && checkKeys ==  true && (name != '$db' && name != '$ref' && name != '$id')) {
          BSON.checkKey(name);        
        }

        if(value == null) {
          // Write the type
          buffer[index++] = BSON.BSON_DATA_NULL;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }        
        } else if(typeof value == 'string') {
          // Write the type
          buffer[index++] = BSON.BSON_DATA_STRING;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }

          // Calculate size
          size = Buffer.byteLength(value) + 1;
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
        } else if((typeof value == 'number' || toString.call(value) === '[object Number]') &&
                  value === parseInt(value, 10) &&
                  value.toString().match(/\./) == null) {                    
          // Write the type
          var int64 = value >= BSON.BSON_INT32_MAX || value < BSON.BSON_INT32_MIN;          
          var startIndex = index;
          // Set type
          buffer[index++] = int64 ? BSON.BSON_DATA_LONG : BSON.BSON_DATA_INT;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }
          
          if(int64) {                         
            // Write the number
            var long = Long.fromNumber(value);
            var lowBits = long.getLowBits();
            var highBits = long.getHighBits();

            // If the number is the same after long conversion force double
            if(value.toString() == long.toNumber().toString() || value >= Long.MAX_VALUE || value <= Long.MIN_VALUE) {
              buffer[startIndex] = BSON.BSON_DATA_NUMBER;
              // Write float
              ieee754.writeIEEE754(buffer, value, index, 'little', 52, 8);
              // Ajust index
              index = index + 8;              
            } else {
              buffer[index + 3] = (lowBits >> 24) & 0xff;      
              buffer[index + 2] = (lowBits >> 16) & 0xff;
              buffer[index + 1] = (lowBits >> 8) & 0xff;
              buffer[index] = lowBits & 0xff;            

              index += 4;

              buffer[index + 3] = (highBits >> 24) & 0xff;      
              buffer[index + 2] = (highBits >> 16) & 0xff;
              buffer[index + 1] = (highBits >> 8) & 0xff;
              buffer[index] = highBits & 0xff;            

              index += 4;              
            }
          } else {                
            // Write the int value to the buffer
            buffer[index + 3] = (value >> 24) & 0xff;      
            buffer[index + 2] = (value >> 16) & 0xff;
            buffer[index + 1] = (value >> 8) & 0xff;
            buffer[index] = value & 0xff;            
            index = index + 4;          
          }
        } else if(typeof value == 'number' || toString.call(value) === '[object Number]' ||
                  value instanceof Double) {
          // Write the type
          buffer[index++] = BSON.BSON_DATA_NUMBER;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }

          // Write float
          ieee754.writeIEEE754(buffer, value, index, 'little', 52, 8);
          // Ajust index
          index = index + 8;
        } else if(typeof value == 'boolean' || toString.call(value) === '[object Boolean]') {
          // Write the type
          buffer[index++] = BSON.BSON_DATA_BOOLEAN;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }

          buffer[index++] = value ? 1 : 0;
        } else if(value instanceof Date || toString.call(value) === '[object Date]') {
          // Write the type
          buffer[index++] = BSON.BSON_DATA_DATE;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }

          // Write the date
          var dateInMilis = Long.fromNumber(value.getTime());
          var lowBits = dateInMilis.getLowBits();
          var highBits = dateInMilis.getHighBits();
          
          buffer[index + 3] = (lowBits >> 24) & 0xff;      
          buffer[index + 2] = (lowBits >> 16) & 0xff;
          buffer[index + 1] = (lowBits >> 8) & 0xff;
          buffer[index] = lowBits & 0xff;            
          index = index + 4;          

          buffer[index + 3] = (highBits >> 24) & 0xff;      
          buffer[index + 2] = (highBits >> 16) & 0xff;
          buffer[index + 1] = (highBits >> 8) & 0xff;
          buffer[index] = highBits & 0xff;            
          index = index + 4;          
        } else if(value instanceof RegExp || toString.call(value) === '[object RegExp]') {
          // Write the type
          buffer[index++] = BSON.BSON_DATA_REGEXP;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }

          // Keep list of valid options
          var options_array = [];
          var str = value.toString();
          var clean_regexp = str.match(/\/.*\//, '');
          clean_regexp = clean_regexp[0].substring(1, clean_regexp[0].length - 1);
          // Get options from the regular expression
          var options = str.substr(clean_regexp.length + 2);

          // Write the regexp to the buffer
          buffer.write(clean_regexp, index, 'utf8');
          // Update the index
          index = index + Buffer.byteLength(clean_regexp) + 1;
          // Write ending cstring zero
          buffer[index - 1] = 0;          

          // Extract all options that are legal and sort them alphabetically
          for(var i = 0, len = options.length; i < len; ++i) {
            var chr = options[i];          
            if('i' == chr || 'm' == chr || 'x' == chr) {
              buffer[index++] = chr.charCodeAt(0)
            }
          }

          // Write ending cstring zero
          buffer[index++] = 0;
        } else if(value instanceof Long) {
          // Write the type
          buffer[index++] = BSON.BSON_DATA_LONG;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }

          // Write the date
          var lowBits = value.getLowBits();
          var highBits = value.getHighBits();
          
          buffer[index + 3] = (lowBits >> 24) & 0xff;      
          buffer[index + 2] = (lowBits >> 16) & 0xff;
          buffer[index + 1] = (lowBits >> 8) & 0xff;
          buffer[index] = lowBits & 0xff;            
          index = index + 4;          

          buffer[index + 3] = (highBits >> 24) & 0xff;      
          buffer[index + 2] = (highBits >> 16) & 0xff;
          buffer[index + 1] = (highBits >> 8) & 0xff;
          buffer[index] = highBits & 0xff;            
          index = index + 4;          
        } else if(value instanceof Timestamp) {
          // Write the type
          buffer[index++] = BSON.BSON_DATA_TIMESTAMP;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }

          // Write the date
          var lowBits = value.getLowBits();
          var highBits = value.getHighBits();
          
          buffer[index + 3] = (lowBits >> 24) & 0xff;      
          buffer[index + 2] = (lowBits >> 16) & 0xff;
          buffer[index + 1] = (lowBits >> 8) & 0xff;
          buffer[index] = lowBits & 0xff;            
          index = index + 4;          

          buffer[index + 3] = (highBits >> 24) & 0xff;      
          buffer[index + 2] = (highBits >> 16) & 0xff;
          buffer[index + 1] = (highBits >> 8) & 0xff;
          buffer[index] = highBits & 0xff;            
          index = index + 4;          
        } else if(value instanceof Binary) {
          // Write the type
          buffer[index++] = BSON.BSON_DATA_BINARY;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }

          // Extract the buffer
          var data = value.value(true);        
          // Calculate size
          size = data.length;
          // Write the size of the string to buffer
          buffer[index + 3] = (size >> 24) & 0xff;     
          buffer[index + 2] = (size >> 16) & 0xff;
          buffer[index + 1] = (size >> 8) & 0xff;
          buffer[index] = size & 0xff;
          // Update the index
          index = index + 4;
          // Write the subtype to the buffer
          buffer[index++] = value.sub_type;
          // Write the data to the object
          data.copy(buffer, index, 0, data.length);
          // Ajust index
          index = index + data.length;
        } else if(value instanceof ObjectID) {
          // Write the type
          buffer[index++] = BSON.BSON_DATA_OID;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }

          // Write objectid
          buffer.write(value.id, index, 'binary');
          // Ajust index
          index = index + 12;
        } else if(value instanceof DBRef) {
          // Write the type
          buffer[index++] = BSON.BSON_DATA_OBJECT;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }

          var ordered_values = {
              '$ref': value.namespace
            , '$id' : value.oid
          };

          if(null != value.db) {
            ordered_values['$db'] = value.db;
          }

          // Update object name index
          currentObjectStored.keysIndex = keysIndex;
          // Push object on stack
          stack[stackIndex++] = currentObjectStored;          
          var objKeys = Object.keys(ordered_values);
          // Set the new object
          currentObjectStored = {object: ordered_values, index: index, endIndex: 0, keys: objKeys, keysIndex: 0, keyLength: objKeys.length};
          keyLength = objKeys.length;
          keysIndex = 0;

          // Adjust index
          index = index + 4;
        } else if(value instanceof Code && Object.keys(value.scope).length == 0) {
          // Write the type
          buffer[index++] = BSON.BSON_DATA_CODE;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }
        
          // Calculate size
          size = Buffer.byteLength(value.code.toString()) + 1;
          // Write the size of the string to buffer
          buffer[index + 3] = (size >> 24) & 0xff;     
          buffer[index + 2] = (size >> 16) & 0xff;
          buffer[index + 1] = (size >> 8) & 0xff;
          buffer[index] = size & 0xff;
          // Ajust the index
          index = index + 4;
          // Write the string
          buffer.write(value.code.toString(), index, 'utf8');
          // Update index
          index = index + size - 1;
          // Write zero
          buffer[index++] = 0;          
        } else if(value instanceof Code) {
          // Calculate the scope size
          var scopeSize = BSON.calculateObjectSize(value.scope);
          // Write the type
          buffer[index++] = BSON.BSON_DATA_CODE_W_SCOPE;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }

          // Convert value to string
          var codeString = value.code.toString();        
          var codeStringLength = Buffer.byteLength(codeString);
          // Calculate size
          size = 4 + codeStringLength + 1 + 4 + scopeSize;        
          // Write the size of the string to buffer
          buffer[index + 3] = (size >> 24) & 0xff;     
          buffer[index + 2] = (size >> 16) & 0xff;
          buffer[index + 1] = (size >> 8) & 0xff;
          buffer[index] = size & 0xff;
          // Update index        
          index = index + 4;

          // Calculate codestring length
          size = codeStringLength + 1;
          // Write the size of the string to buffer
          buffer[index + 3] = (size >> 24) & 0xff;     
          buffer[index + 2] = (size >> 16) & 0xff;
          buffer[index + 1] = (size >> 8) & 0xff;
          buffer[index] = size & 0xff;
          // Update index        
          index = index + 4;

          // Write the string
          buffer.write(codeString, index, 'utf8');
          // Update index
          index = index + codeStringLength;
          // Add final 0 for cstring        
          buffer[index++] = 0;

          // Update object name index
          currentObjectStored.keysIndex = keysIndex;
          // Push object on stack
          stack[stackIndex++] = currentObjectStored;          
          var objKeys = Object.keys(value.scope);
          // Set the new object
          currentObjectStored = {object: value.scope, index: index, endIndex: 0, keys: objKeys, keysIndex: 0, keyLength: objKeys.length};
          keyLength = objKeys.length;
          keysIndex = 0;
          // Adjust index
          index = index + 4;        
        } else if(value instanceof Symbol) {
          // Write the type
          buffer[index++] = BSON.BSON_DATA_SYMBOL;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }

          // Calculate size
          size = Buffer.byteLength(value.value) + 1;
          // Write the size of the string to buffer
          buffer[index + 3] = (size >> 24) & 0xff;     
          buffer[index + 2] = (size >> 16) & 0xff;
          buffer[index + 1] = (size >> 8) & 0xff;
          buffer[index] = size & 0xff;
          // Ajust the index
          index = index + 4;
          // Write the string
          buffer.write(value.value, index, 'utf8');
          // Update index
          index = index + size - 1;
          // Write zero
          buffer[index++] = 0;
        } else if(typeof value == 'function' && serializeFunctions) {
          // Write the type
          buffer[index++] = BSON.BSON_DATA_CODE;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }
        
          // Calculate size
          size = Buffer.byteLength(value.toString()) + 1;
          // Write the size of the string to buffer
          buffer[index + 3] = (size >> 24) & 0xff;     
          buffer[index + 2] = (size >> 16) & 0xff;
          buffer[index + 1] = (size >> 8) & 0xff;
          buffer[index] = size & 0xff;
          // Ajust the index
          index = index + 4;
          // Write the string
          buffer.write(value.toString(), index, 'utf8');
          // Update index
          index = index + size - 1;
          // Write zero
          buffer[index++] = 0;
        } else if(value instanceof MinKey) {
          // Write the type of either Array or object
          buffer[index++] = BSON.BSON_DATA_MIN_KEY;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }
        } else if(value instanceof MaxKey) {
          // Write the type of either Array or object
          buffer[index++] = BSON.BSON_DATA_MAX_KEY;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }
        } else if(typeof value == 'object') {
          // Write the type of either Array or object
          buffer[index++] = Array.isArray(value) ? BSON.BSON_DATA_ARRAY : BSON.BSON_DATA_OBJECT;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }

          // Update object name index
          currentObjectStored.keysIndex = keysIndex;
          // Push object on stack
          stack[stackIndex++] = currentObjectStored;          
          var objKeys = Object.keys(value);
          // Set the new object
          currentObjectStored = {object: value, index: index, endIndex: 0, keys: objKeys, keysIndex: 0, keyLength: objKeys.length};
          keyLength = objKeys.length;
          keysIndex = 0;

          // Adjust index
          index = index + 4;
        }      

        if(keysIndex == keyLength) {
          // Save end index
          currentObjectStored.endIndex = index;

          // If we have a stack pop and finish up processing
          if(stackIndex > 0) {  
            // Write the current object size out
            // Pack the size of the total buffer length
            size = currentObjectStored.endIndex - currentObjectStored.index + 1;          
            // Write the size of the string to buffer
            buffer[currentObjectStored.index + 3] = (size >> 24) & 0xff;     
            buffer[currentObjectStored.index + 2] = (size >> 16) & 0xff;
            buffer[currentObjectStored.index + 1] = (size >> 8) & 0xff;
            buffer[currentObjectStored.index] = size & 0xff;          
            // Adjust and set null last parameter
            buffer[index++] = 0;

            // Pop off the stored object
            // currentObjectStored = stack.pop();            
            currentObjectStored = stack[--stackIndex];
            keysIndex = currentObjectStored.keysIndex;
            keyLength = currentObjectStored.keyLength;
          }
        }
      }

      if(stackIndex > 0) {                          
        // Write the current object size out
        // Pack the size of the total buffer length
        size = stackIndex >= 1 ? (index - currentObjectStored.index + 1) :
          currentObjectStored.endIndex - currentObjectStored.index + 16;      
        // Write the size of the string to buffer
        buffer[currentObjectStored.index + 3] = (size >> 24) & 0xff;     
        buffer[currentObjectStored.index + 2] = (size >> 16) & 0xff;
        buffer[currentObjectStored.index + 1] = (size >> 8) & 0xff;
        buffer[currentObjectStored.index] = size & 0xff;   
        // Adjust and set null last parameter
        buffer[index++] = 0;      
        // Pop off the stored object
        currentObjectStored = stack[--stackIndex];
        keysIndex = currentObjectStored.keysIndex;
        keyLength = currentObjectStored.keyLength;
      } else {          
        // Pack the size of the total buffer length
        size = buffer.length;
        // Write the size of the string to buffer
        buffer[3] = (size >> 24) & 0xff;     
        buffer[2] = (size >> 16) & 0xff;
        buffer[1] = (size >> 8) & 0xff;
        buffer[0] = size & 0xff;  
        // Set last buffer field to 0
        buffer[buffer.length - 1] = 0;      
        // return buffer;      
        done = true;
        break;
      }
    }

    // If we passed in an index
    return index;  
  } else {
    throw new Error("Not a valid object");
  }
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
 * Deserialize `data` as BSON.
 *
 * @param {TODO} data
 * @param {Bool} is_array_item
 * @param {TODO} returnData
 * @param {TODO} returnArray
 * @return {TODO}
 */
 
BSON.deserialize = function(data, options) {
  if(!(data instanceof Buffer)) throw new Error("data stream not a buffer object");
  // Finial object returned to user
  var object = {};
  var currentObject = object;
  // Index for parse position
  var index = 0;
  // Stack for keeping parser objects
  var stack = new Array(8);
  var stackIndex = 0;
  // Size Of data
  var bufferLength = data.length;
  // Local variables
  var value = null;
  var string_name = null;
  var string_end_index = 0;
  var string_size = 0;
  // Variables keeping track of sub object parsing
  var object_end_index = 0;
  var object_name= null;
  
  // Options
  options = options == null ? {} : options;
  var evalFunctions = options['evalFunctions'] == null ? false : options['evalFunctions'];
  var cacheFunctions = options['cacheFunctions'] == null ? false : options['cacheFunctions'];
  var cacheFunctionsCrc32 = options['cacheFunctionsCrc32'] == null ? false : options['cacheFunctionsCrc32'];
  
  // Decode 
  var size = data[index] | data[index + 1] << 8 | data[index + 2] << 16 | data[index + 3] << 24;
  // Ajust index
  index = index + 4;
  // Data length
  var dataLength = data.length;
  
  while(index < dataLength) {
    // Read the first byte indicating the type of object
    var type = data[index];    

    // Adjust for the type of element
    index = index + 1;    

    // Check if we have finished an object
    if(object_end_index !== 0 && index > object_end_index) {
      // Save the current Object for storing
      var value = currentObject;

      // Pop the previous object so we can add the attribute
      var currentObjectInstance = stack[--stackIndex];
      
      // Let's set the parent object as the current Object      
      if(currentObjectInstance != null) {        
        currentObject = currentObjectInstance.object;
        object_end_index = currentObjectInstance.index;

        if(value['$id'] != null && value['$ref'] != null) {
          value = new DBRef(value['$ref'], value['$id'], value['$db']);
        }

        currentObject[currentObjectInstance.name] = value;
      }
    }
    
    if(type === BSON.BSON_DATA_OBJECT || type === BSON.BSON_DATA_ARRAY) {
      // Read the null terminated string (indexof until first 0)
      string_end_index = index;
      while(data[string_end_index++] !== 0);      
      string_end_index = string_end_index - 1;
          
      // Fetch the string name
      object_name = data.toString('utf8', index, string_end_index);
      // Ajust index to point to the end of the string
      index = string_end_index + 1;

      // Decode the length of the object (next 4 bytes)
      var object_size = data[index] | data[index + 1] << 8 | data[index + 2] << 16 | data[index + 3] << 24;
      // Stack object
      var stackObject = {name: object_name, object: currentObject, index: object_end_index};
      // Let's push the current object to the stack and work on this one
      stack[stackIndex++] = stackObject;
      // Set current pointer to empty object
      currentObject = type === BSON.BSON_DATA_ARRAY ? [] : {};
      // Set the end index for the new object so we know then to stop
      object_end_index = index + object_size;
      // Ajdust index
      index = index + 4;        
    } else if(type === BSON.BSON_DATA_STRING) {
      // Read the null terminated string (indexof until first 0)
      string_end_index = index;
      while(data[string_end_index++] !== 0);      
      string_end_index = string_end_index - 1;
            
      // Fetch the string name
      string_name = data.toString('utf8', index, string_end_index);
      // Ajust index to point to the end of the string
      index = string_end_index + 1;
      
      // Decode the length of the string (next 4 bytes)
      string_size = data[index] | data[index + 1] << 8 | data[index + 2] << 16 | data[index + 3] << 24;
      // Adjust the index to point at start of string
      index = index + 4;
      // Read the string
      value = string_size == 0 ? '' : data.toString('utf8', index, index + string_size - 1);
      // Adjust the index with the size of the string
      index = index + string_size;
      
      // Set object property
      currentObject[Array.isArray(currentObject) ? parseInt(string_name, 10) : string_name] = value;
    } else if(type === BSON.BSON_DATA_REGEXP) {
      // Read the null terminated string (indexof until first 0)
      string_end_index = index;
      while(data[string_end_index++] !== 0);      
      string_end_index = string_end_index - 1;
      
      // Fetch the string name
      string_name = data.toString('utf8', index, string_end_index);
      // Ajust index to point to the end of the string
      index = string_end_index + 1;      

      // Read characters until end of regular expression
      var reg_exp_array = [];
      var chr = 1;
      var start_index = index;

      while(data[index] !== 0) {
        index = index + 1;
      }

      // RegExp Expression
      var reg_exp = data.toString('utf8', start_index, index);
      index = index + 1;

      // Read the options for the regular expression
      var options_array = [];

      while(data[index] !== 0) {
        options_array.push(String.fromCharCode(data[index]));
        index = index + 1;
      }

      // Regular expression
      var value = new RegExp(reg_exp, options_array.join(''));

      // Set object property
      currentObject[Array.isArray(currentObject) ? parseInt(string_name, 10) : string_name] = value;
    } else if(type === BSON.BSON_DATA_DATE) {
      // Read the null terminated string (indexof until first 0)
      string_end_index = index;
      while(data[string_end_index++] !== 0);      
      string_end_index = string_end_index - 1;
      
      // Fetch the string name
      string_name = data.toString('utf8', index, string_end_index);
      // Ajust index to point to the end of the string
      index = string_end_index + 1;      
      
      // Read low bits
      var low_bits = data[index] | data[index + 1] << 8 | data[index + 2] << 16 | data[index + 3] << 24;
      // Adjust index
      index = index + 4;
      // Read high bits
      var high_bits = data[index] | data[index + 1] << 8 | data[index + 2] << 16 | data[index + 3] << 24;
      // Adjust index
      index = index + 4;
  
      // Create to integers
      var value_in_seconds = new Long(low_bits, high_bits).toNumber();
      // Calculate date with miliseconds
      var value = new Date();
      value.setTime(value_in_seconds);
      
      // Set object property
      currentObject[Array.isArray(currentObject) ? parseInt(string_name, 10) : string_name] = value;
    } else if(type === BSON.BSON_DATA_BINARY) {
      // Read the null terminated string (indexof until first 0)
      string_end_index = index;
      while(data[string_end_index++] !== 0);      
      string_end_index = string_end_index - 1;
            
      // Fetch the string name
      string_name = data.toString('utf8', index, string_end_index);
      // Ajust index to point to the end of the string
      index = string_end_index + 1;

      // Read the size of the binary
      var number_of_bytes = data[index] | data[index + 1] << 8 | data[index + 2] << 16 | data[index + 3] << 24;
      index = index + 4;

      // Decode the subtype
      var sub_type = data[index];
      index = index + 1;
  
      // Read the next bytes into our Binary object
      var bin_data = data.slice(index, index + number_of_bytes);
      // Binary object
      var value = new Binary(bin_data);
      value.sub_type = sub_type;
      // Adjust index with number of bytes
      index = index + number_of_bytes;

      // Set object property
      currentObject[Array.isArray(currentObject) ? parseInt(string_name, 10) : string_name] = value;
    } else if(type === BSON.BSON_DATA_NUMBER) {
      // Read the null terminated string (indexof until first 0)
      string_end_index = index;
      while(data[string_end_index++] !== 0);      
      string_end_index = string_end_index - 1;
            
      // Fetch the string name
      string_name = data.toString('utf8', index, string_end_index);
      // Ajust index to point to the end of the string
      index = string_end_index + 1;
      
      // Read the number value
      var value = ieee754.readIEEE754(data, index, 'little', 52, 8);     
      // Adjust the index with the size
      index = index + 8;

      // Set object property
      currentObject[Array.isArray(currentObject) ? parseInt(string_name, 10) : string_name] = value;
    } else if(type === BSON.BSON_DATA_OID) {
      // Read the null terminated string (indexof until first 0)
      string_end_index = index;
      while(data[string_end_index++] !== 0);      
      string_end_index = string_end_index - 1;
      
      // Fetch the string name
      string_name = data.toString('utf8', index, string_end_index);
      // Ajust index to point to the end of the string
      index = string_end_index + 1;

      // Read the oid (12 bytes)
      var oid = data.toString('binary', index, index + 12);
      // Calculate date with miliseconds
      var value = new ObjectID(oid);
      // Adjust the index
      index = index + 12;      

      // Set object property
      currentObject[Array.isArray(currentObject) ? parseInt(string_name, 10) : string_name] = value;
    } else if(type === BSON.BSON_DATA_CODE) {
      // Read the null terminated string (indexof until first 0)
      string_end_index = index;
      while(data[string_end_index++] !== 0);      
      string_end_index = string_end_index - 1;
            
      // Fetch the string name
      string_name = data.toString('utf8', index, string_end_index);
      // Ajust index to point to the end of the string
      index = string_end_index + 1;

      var string_size = data[index] | data[index + 1] << 8 | data[index + 2] << 16 | data[index + 3] << 24;
      index = index + 4;

      // Establish start and end of code string
      var codeStartIndex = index;
      var codeEndIndex = index + string_size - 1;
      // Read the string + terminating null
      var code_string = data.toString('utf8', codeStartIndex, codeEndIndex);
      // Adjust index passed code string
      index = index + string_size;      

      // Final value
      var value = null;
      
      // If we are evaluating the functions
      if(evalFunctions) {
        // If we have cache enabled let's look for the md5 of the function in the cache        
        if(cacheFunctions) {
          var hash = cacheFunctionsCrc32 ? crc32(data, codeStartIndex, codeEndIndex) : code_string;
          // Check for cache hit, eval if missing and return cached function
          if(functionCache[hash] == null) {            
            eval("value = " + code_string);          
            functionCache[hash] = value;
          }
          
          value = functionCache[hash];
        } else {
          eval("value = " + code_string);          
        }
      } else {
        value = new Code(code_string, {});
      }

      // Set object property
      currentObject[Array.isArray(currentObject) ? parseInt(string_name, 10) : string_name] = value;      
    } else if(type === BSON.BSON_DATA_CODE_W_SCOPE) {
      // Read the null terminated string (indexof until first 0)
      string_end_index = index;
      while(data[string_end_index++] !== 0);      
      string_end_index = string_end_index - 1;
            
      // Fetch the string name
      string_name = data.toString('utf8', index, string_end_index);
      // Ajust index to point to the end of the string
      index = string_end_index + 1;

      // Unpack the integer sizes
      var total_code_size = data[index] | data[index + 1] << 8 | data[index + 2] << 16 | data[index + 3] << 24;
      index = index + 4;
      var string_size = data[index] | data[index + 1] << 8 | data[index + 2] << 16 | data[index + 3] << 24;
      index = index + 4;
      // Read the string + terminating null
      var code_string = data.toString('utf8', index, index + string_size - 1);
      index = index + string_size;
      // Get the bson object
      var bson_object_size = total_code_size - string_size - 8;
      var bson_object_string = data.slice(index, index + bson_object_size);
      index = index + bson_object_size;
      // Parse the bson object
      var scope_object = BSON.deserialize(bson_object_string, false);
      // Create code object
      var value = new Code(code_string, scope_object);
      
      // Set object property
      currentObject[Array.isArray(currentObject) ? parseInt(string_name, 10) : string_name] = value;
    } else if(type === BSON.BSON_DATA_LONG || type === BSON.BSON_DATA_TIMESTAMP) {
      // Read the null terminated string (indexof until first 0)
      string_end_index = index;
      while(data[string_end_index++] !== 0);      
      string_end_index = string_end_index - 1;
            
      // Fetch the string name
      string_name = data.toString('utf8', index, string_end_index);
      // Ajust index to point to the end of the string
      index = string_end_index + 1;

      // Read the number value
      var low_bits = data[index] | data[index + 1] << 8 | data[index + 2] << 16 | data[index + 3] << 24;
      // Adjust index
      index = index + 4;
      // Read high bits
      var high_bits = data[index] | data[index + 1] << 8 | data[index + 2] << 16 | data[index + 3] << 24;
      // Adjust index
      index = index + 4;
      var value;

      if (type === BSON.BSON_DATA_LONG) {
        // Convert to long
        value = new Long(low_bits, high_bits);

        // Convert to number
        if(value.lessThanOrEqual(JS_INT_MAX_LONG) && value.greaterThanOrEqual(JS_INT_MIN_LONG)) {
          value = value.toNumber();
        }
      } else {
        value = new Timestamp(low_bits, high_bits);
      }

      // Set object property
      currentObject[Array.isArray(currentObject) ? parseInt(string_name, 10) : string_name] = value;
    } else if(type === BSON.BSON_DATA_INT) {
      // Read the null terminated string (indexof until first 0)
      string_end_index = index;
      while(data[string_end_index++] !== 0);      
      string_end_index = string_end_index - 1;
            
      // Fetch the string name
      string_name = data.toString('utf8', index, string_end_index);
      // Ajust index to point to the end of the string
      index = string_end_index + 1;
      
      // Decode the length of the string (next 4 bytes)
      var value = data[index] | data[index + 1] << 8 | data[index + 2] << 16 | data[index + 3] << 24;
      // Adjust the index with the size
      index = index + 4;

      // Set object property
      currentObject[Array.isArray(currentObject) ? parseInt(string_name, 10) : string_name] = value;
    } else if(type === BSON.BSON_DATA_NULL) {
      // Read the null terminated string (indexof until first 0)
      string_end_index = index;
      while(data[string_end_index++] !== 0);      
      string_end_index = string_end_index - 1;
            
      // Fetch the string name
      string_name = data.toString('utf8', index, string_end_index);
      // Ajust index to point to the end of the string
      index = string_end_index + 1;
      // Set null value
      value = null;
      
      // Set object property
      currentObject[Array.isArray(currentObject) ? parseInt(string_name, 10) : string_name] = value;
    } else if(type === BSON.BSON_DATA_BOOLEAN) {
      // Read the null terminated string (indexof until first 0)
      string_end_index = index;
      while(data[string_end_index++] !== 0);      
      string_end_index = string_end_index - 1;
            
      // Fetch the string name
      string_name = data.toString('utf8', index, string_end_index);
      // Ajust index to point to the end of the string
      index = string_end_index + 1;
      
      // Read the length of the string (next 4 bytes)
      var boolean_value = data[index];
      var value = boolean_value == 1 ? true : false;
      // Adjust the index
      index = index + 1;

      // Set object property
      currentObject[Array.isArray(currentObject) ? parseInt(string_name, 10) : string_name] = value;
    } else if(type === BSON.BSON_DATA_MIN_KEY) {
      // Read the null terminated string (indexof until first 0)
      string_end_index = index;
      while(data[string_end_index++] !== 0);      
      string_end_index = string_end_index - 1;
            
      // Fetch the string name
      string_name = data.toString('utf8', index, string_end_index);      
      // Ajust index to point to the end of the string
      index = string_end_index + 1;

      // Set object property
      currentObject[Array.isArray(currentObject) ? parseInt(string_name, 10) : string_name] = new MinKey();      
    } else if(type === BSON.BSON_DATA_MAX_KEY) {
      // Read the null terminated string (indexof until first 0)
      string_end_index = index;
      while(data[string_end_index++] !== 0);      
      string_end_index = string_end_index - 1;
            
      // Fetch the string name
      string_name = data.toString('utf8', index, string_end_index);      
      // Ajust index to point to the end of the string
      index = string_end_index + 1;

      // Set object property
      currentObject[Array.isArray(currentObject) ? parseInt(string_name, 10) : string_name] = new MaxKey();      
    } else if(type === BSON.BSON_DATA_SYMBOL) {
      // Read the null terminated string (indexof until first 0)
      string_end_index = index;
      while(data[string_end_index++] !== 0);      
      string_end_index = string_end_index - 1;
            
      // Fetch the string name
      string_name = data.toString('utf8', index, string_end_index);      
      // Ajust index to point to the end of the string
      index = string_end_index + 1;
      
      // Decode the length of the string (next 4 bytes)
      string_size = data[index] | data[index + 1] << 8 | data[index + 2] << 16 | data[index + 3] << 24;      
      // Adjust the index to point at start of string
      index = index + 4;
      // Read the string
      value = string_size == 0 ? '' : new Symbol(data.toString('utf8', index, index + string_size - 1));
      // Adjust the index with the size of the string
      index = index + string_size;
      
      // Set object property
      currentObject[Array.isArray(currentObject) ? parseInt(string_name, 10) : string_name] = value;      
    }
  }
  
  // Return the object
  return object;
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
 * Code constructor.
 *
 * @param {TODO} code
 * @param {TODO} scope
 */

function Code(code, scope) {
  this.code = code;
  this.scope = scope == null ? {} : scope;
};

Code.prototype.toJSON = function() {
  return {scope:this.scope, code:this.code};
}

/**
 * Symbol constructor.
 *
 * @param {TODO} value
 */
function Symbol(value) {
  this.value = value;
}

Symbol.prototype.toString = function() {
  return this.value;
}

Symbol.prototype.inspect = function() {
  return this.value;
}

Symbol.prototype.toJSON = function() {
  return this.value;
}

/**
 * MinKey constructor
 *
 */
function MinKey() {}

/**
 * MaxKey constructor
 *
 */
function MaxKey() {}

/**
 * DBRef constructor.
 *
 * @param {TODO} namespace
 * @param {TODO} oid
 * @param {TODO} db
 */

function DBRef (namespace, oid, db) {
  this.namespace = namespace;
  this.oid = oid;
  this.db = db;
};

DBRef.prototype.toJSON = function() {
  return {
    '$ref':this.namespace,
    '$id':this.oid,
    '$db':this.db == null ? '' : this.db
  };
}

/**
 * Expose.
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
