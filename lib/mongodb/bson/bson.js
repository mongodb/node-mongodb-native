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
BSON.calculateObjectSize = function(object) {
  var totalLength = (4 + 1);
  var done = false;
  var stack = [];
  var currentObject = object;
  var keys = null;
  // Controls the flow
  var finished = false;

  while(!done) {
    // Only get keys if we have a new object
    keys = keys == null ? Object.keys(currentObject) : keys;

    // Let's process all the elements
    while(keys.length > 0) {
      var name = keys.shift();
      var value = currentObject[name];

      if(value == null) {
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (1);
      } else if(typeof value == 'string') {
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (Buffer.byteLength(value, 'utf8') + 4 + 1 + 1);
      } else if(Array.isArray(value)) {
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (4 + 1) + 1;
        stack.push({keys:keys, object:currentObject});
        currentObject = value;
        keys = Object.keys(value)
      } else if(typeof value == 'number' || toString.call(value) === '[object Number]') {
        if(value >= BSON.BSON_INT32_MAX || value < BSON.BSON_INT32_MIN ||
           value !== parseInt(value, 10)) {
          // Long and Number take same number of bytes.
          totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (8 + 1);
        } else {
          totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (4 + 1);
        }
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
        stack.push({keys:keys, object:currentObject});
        currentObject = ordered_values;
        keys = Object.keys(ordered_values)
      } else if(value instanceof Code && Object.keys(value.scope).length == 0) {
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (Buffer.byteLength(value.code.toString(), 'utf8') + 4 + 1 + 1);
      } else if(value instanceof Code) {
        // Calculate the length of the code string
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + 4 + (Buffer.byteLength(value.code.toString(), 'utf8') + 1) + 4;
        totalLength += (4 + 1 + 1);
        // Push the current object
        stack.push({keys:keys, object:currentObject});
        currentObject = value.scope;
        keys = Object.keys(value.scope)
      } else if(value instanceof Symbol) {
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (Buffer.byteLength(value.value, 'utf8') + 4 + 1 + 1);
      } else if(typeof value == 'object') {
        // Calculate the object
        totalLength += (name != null ? (Buffer.byteLength(name) + 1) : 0) + (4 + 1 + 1);
        // Otherwise handle keys
        stack.push({keys:keys, object:currentObject});
        currentObject = value;
        keys = Object.keys(value)
      }

      // Finished up the object
      if(keys.length == 0) {
        finished = true;
      }
    }

    // If the stack is empty let's finish up, otherwise pop the previous object and
    // continue
    if(stack.length == 0) {
      done = true;
    } else if(finished || keys.length == 0){
      var currentObjectStored = stack.pop();
      currentObject = currentObjectStored.object;
      keys = currentObjectStored.keys;
      finished = keys.length == 0;
    }
  }

  return totalLength;
}

// In place serialization with index to starting point of serialization
BSON.serializeWithBufferAndIndex = function serializeWithBufferAndIndex(object, checkKeys, buffer, startIndex) {
  if(null != object && 'object' === typeof object) {
    // Encode the object using single allocated buffer and no recursion
    var index = startIndex == null ? 0 : startIndex;
    var done = false;
    var stack = [];
    var currentObject = object;
    var keys = null;
    var size = 0;
    var objectIndex = 0;
    var totalNumberOfObjects = 0;
    // Special index for Code objects
    var codeStartIndex = 0;
    // Signals if we are finished up
    var finished = false;  

    // Current parsing object state
    var currentObjectStored = {object: object, index: index, endIndex: 0, keys: Object.keys(object)};  
  	// Adjust the index
  	index = index + 4;

    // While meeting
    while(!done) {
      // While current object has keys
      while(currentObjectStored.keys.length > 0) {
        var name = currentObjectStored.keys.shift();
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
                  value >= BSON.JS_INT_MIN && value <= BSON.JS_INT_MAX) {
          // Write the type
          var int64 = value >= BSON.BSON_INT32_MAX || value < BSON.BSON_INT32_MIN;
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

          // Push object on stack
          stack.push(currentObjectStored);          
          // Set the new object
          currentObjectStored = {object: ordered_values, index: index, endIndex: 0, keys: Object.keys(ordered_values)};
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

          // Push the scope object
          stack.push(currentObjectStored);          
          // Set the new object
          currentObjectStored = {object: value.scope, index: index, endIndex: 0, keys: Object.keys(value.scope)};
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
        } else if(typeof value == 'object') {
          // Write the type of either Array or object
          buffer[index++] = Array.isArray(value) ? BSON.BSON_DATA_ARRAY : BSON.BSON_DATA_OBJECT;
          // Write the name
          if(name != null) {
            index = index + buffer.write(name, index, 'utf8') + 1;
            buffer[index - 1] = 0;          
          }

          // Push object on stack
          stack.push(currentObjectStored);          
          // Set the new object
          currentObjectStored = {object: value, index: index, endIndex: 0, keys: Object.keys(value)};
          // Adjust index
          index = index + 4;
        }      

        if(currentObjectStored.keys.length == 0) {
          // Save end index
          currentObjectStored.endIndex = index;

          // If we have a stack pop and finish up processing
          if(stack.length > 0) {  
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
            currentObjectStored = stack.pop();            
          }
        }
      }

      if(stack.length > 0) {          
        // Write the current object size out
        // Pack the size of the total buffer length
        size = stack.length >= 1 ? (index - currentObjectStored.index + 1) :
          currentObjectStored.endIndex - currentObjectStored.index + 16;      
        // Write the size of the string to buffer
        buffer[currentObjectStored.index + 3] = (size >> 24) & 0xff;     
        buffer[currentObjectStored.index + 2] = (size >> 16) & 0xff;
        buffer[currentObjectStored.index + 1] = (size >> 8) & 0xff;
        buffer[currentObjectStored.index] = size & 0xff;   
        // Adjust and set null last parameter
        buffer[index++] = 0;      
        // Pop off the stored object
        currentObjectStored = stack.pop();            
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

BSON.serialize = function(object, checkKeys, asBuffer) {
  var buffer = new Buffer(BSON.calculateObjectSize(object));
  BSON.serializeWithBufferAndIndex(object, checkKeys, buffer, 0);
  return buffer;
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
 
BSON.deserialize = function(data) {
  if(!(data instanceof Buffer)) throw new Error("data stream not a buffer object");
  // Finial object returned to user
  var object = {};
  var currentObject = object;
  // Index for parse position
  var index = 0;
  // Stack for keeping parser objects
  var stack = [];
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
  
  // Decode 
  var size = data[index] | data[index + 1] << 8 | data[index + 2] << 16 | data[index + 3] << 24;
  // Ajust index
  index = index + 4;
  // Data length
  var dataLength = data.length;
  
  while(index < dataLength) {
    // debug("currentObject :: " + inspect(currentObject))
    // Read the first byte indicating the type of object
    var type = data[index];    
    
    // Adjust for the type of element
    index = index + 1;    

    // Check if we have finished an object
    if(object_end_index !== 0 && index > object_end_index) {
      // Save the current Object for storing
      var value = currentObject;

      // Pop the previous object so we can add the attribute
      var currentObjectInstance = stack.pop();
      
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
    
    if(type === BSON.BSON_DATA_STRING) {
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
        value = new Long(low_bits, high_bits);
        // Tricky: if this value is in [-2^53, 2^53], then it's perfectly
        // representable as a Number.
        if ((high_bits < 0x200000 || (high_bits === 0x200000 && low_bits === 0)) &&
            high_bits >= -0x200000) {
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
    } else if(type === BSON.BSON_DATA_OBJECT || type === BSON.BSON_DATA_ARRAY) {
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
      stack.push(stackObject);
      // Set current pointer to empty object
      currentObject = type === BSON.BSON_DATA_ARRAY ? [] : {};
      // Set the end index for the new object so we know then to stop
      object_end_index = index + object_size;
      // Ajdust index
      index = index + 4;        
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
  return JSON.stringify({
    '$ref':this.namespace,
    '$id':this.oid,
    '$db':this.db == null ? '' : this.db
  });
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
