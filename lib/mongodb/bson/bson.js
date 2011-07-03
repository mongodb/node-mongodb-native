/**
 * Module dependencies.
 */
var BinaryParser = require('./binary_parser').BinaryParser
  , Long = require('../goog/math/long').Long
  , Timestamp = require('./timestamp').Timestamp
  , ObjectID = require('./objectid').ObjectID
  , Binary = require('./binary').Binary
  , debug = require('util').debug
  , inspect = require('util').inspect
  , inherits = require('util').inherits
  , ieee754 = require('./float_parser')
  , binaryutils = require('./binary_utils');  

/**
 * BSON constructor.
 */

function BSON () {};

// BSON MAX VALUES
BSON.BSON_INT32_MAX = 2147483648;
BSON.BSON_INT32_MIN = -2147483648;

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
  var totalLength = 0;
  var done = false;
  var stack = [];
  var currentObject = object;
  var keys = null;

  debug("--------------------------------------------------------- calculate object")
  
  while(!done) {
    // Only get keys if we have a new object
    keys = keys == null ? Object.keys(currentObject) : keys;    
    
    // debug(inspect(keys))

    // Let's process all the elements
    while(keys.length > 0) {
      var name = keys.pop();
      var value = object[name];
      debug("---------------- :: " + name + " = " + (typeof value))
      
      if(Array.isArray(value)) {
        debug("--------------------- array")
      } else if(typeof value == 'object') {
        stack.push({keys:keys, object:currentObject});
        currentObject = value;
        keys = null
        break;
      }
    }
    
    // If the stack is empty let's finish up, otherwise pop the previous object and
    // continue
    if(stack.length == 0) {
      done = true;
    } else {
      currentObjectStored = stack.pop();
      currentObject = currentObjectStored.object;
      keys = currentObjectStored.keys;
    }
  }
}

BSON.serialize = function serialize(object, checkKeys, asBuffer) {
  asBuffer = asBuffer == null ? false : asBuffer;
  var buffers = [];

  if(object instanceof Object) {
    // Calculate the size of the object
    var calculatedSize = BSON.calculateObjectSize(object);
    
    var totalLength = BSON.encodeObject(buffers, null, object, checkKeys == null ? false : checkKeys);
    var finalBuffer = new Buffer(totalLength);
    var index = 0;

    for(var i = 0; i < buffers.length; i++) {
      buffers[i].copy(finalBuffer, index);
      index = index + buffers[i].length;
    }

    return asBuffer ? finalBuffer : finalBuffer.toString('binary')    
  } else {
    throw new Error("Not a valid object");
  }
};

BSON.encodeNull = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = binaryutils.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }

  return (nameBuffers != null ? nameBuffers[0].length + 1: 0);    
}

BSON.encodeFloat = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = binaryutils.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }

  // Unpack variables
  var floatBuffer = new Buffer(8);
  ieee754.writeIEEE754(floatBuffer, value, 0, 'little', 52, 8);
  
  // Add values to buffer
  buffers.push(floatBuffer);
  return (nameBuffers != null ? nameBuffers[0].length + 1: 0) + 8;  
}

BSON.encodeDate = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = binaryutils.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }

  var dateBuffer = new Buffer(8);
  var dateInMilis = Long.fromNumber(value.getTime());
  binaryutils.encodeIntInPlace(dateInMilis.getLowBits(), dateBuffer, 0);
  binaryutils.encodeIntInPlace(dateInMilis.getHighBits(), dateBuffer, 4);

  // Add values to buffer
  buffers.push(dateBuffer);
  return (nameBuffers != null ? nameBuffers[0].length + 1: 0) + 8;  
}

BSON.encodeInt32 = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = binaryutils.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }

  // Unpack variables
  buffers.push(binaryutils.encodeInt(value));
  return (nameBuffers != null ? nameBuffers[0].length + 1: 0) + 4;
}


BSON.encodeBoolean = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = binaryutils.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }
  // Unpack variables
  buffers.push(new Buffer([value ? 1 : 0]));
  return (nameBuffers != null ? nameBuffers[0].length + 1: 0) + 1;  
}

BSON.encodeString = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = binaryutils.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }

  // Unpack variables
  var valueBuffers = binaryutils.encodeCString(value);

  // Add values to buffer
  buffers.push(binaryutils.encodeInt(valueBuffers[0].length + 1));
  buffers.push(valueBuffers[0], valueBuffers[1]);
  return (nameBuffers != null ? nameBuffers[0].length + 1: 0) + valueBuffers[0].length + 1 + 4;
}

BSON.encodeArray = function(buffers, name, value) {
  var arrayBuffers = [];
  var arrayTotalLength = 0;
  
  for(var i = 0; i < value.length; i++) {    
    var valueBuffers = [];
    var indexStringBuffers = binaryutils.encodeCString(i.toString());
    arrayTotalLength += BSON.encodeValue(valueBuffers, null, value[i]) + indexStringBuffers[0].length + 1;
    // Add type and the index string to the array
    arrayBuffers.push(valueBuffers[0], indexStringBuffers[0], indexStringBuffers[1])
    // Add object data minus first field
    for(var j = 1; j < valueBuffers.length; j++) arrayBuffers.push(valueBuffers[j]);
  }
  
  if(name != null) {
    var nameBuffers = binaryutils.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }

  // Add values to buffer
  buffers.push(binaryutils.encodeInt(arrayTotalLength + 4 + 1));
  for(var i = 0; i < arrayBuffers.length; i++) buffers.push(arrayBuffers[i])
  buffers.push(new Buffer([0]));
  return (nameBuffers != null ? nameBuffers[0].length + 1: 0) + arrayTotalLength + 4 + 1;
}

BSON.encodeValue = function(buffers, elementName, value, checkKeys) {
  var objectLength = 0;
  var toString = Object.prototype.toString;

  // debug("================ toString.call(value) :: " + toString.call(value))

  // If we got a key check for valid type
  if(elementName != null && checkKeys) {
    BSON.checkKey(elementName);        
  }

  // debug("============ " + toString.call(value))
  // 
  if(value == null) {
    buffers.push(new Buffer([BSON.BSON_DATA_NULL]));
    objectLength += BSON.encodeNull(buffers, elementName, value);
  } else if(typeof value == 'string' || toString.call(value) === '[object String]') {    
    buffers.push(new Buffer([BSON.BSON_DATA_STRING]));
    objectLength += BSON.encodeString(buffers, elementName, value);
  } else if(typeof value == 'number' && value === parseInt(value, 10)) {
    if(value >= BSON.BSON_INT32_MAX || value < BSON.BSON_INT32_MIN) {      
      buffers.push(new Buffer([BSON.BSON_DATA_LONG]));
      objectLength += BSON.encodeLong(buffers, elementName, Long.fromNumber(value));
    } else {                
      buffers.push(new Buffer([BSON.BSON_DATA_INT]));
      objectLength += BSON.encodeInt32(buffers, elementName, value);
    }
  } else if(typeof value == 'number' || toString.call(value) === '[object Number]') {
    buffers.push(new Buffer([BSON.BSON_DATA_NUMBER]));
    objectLength += BSON.encodeFloat(buffers, elementName, value);
  } else if(typeof value == 'boolean' || toString.call(value) === '[object Boolean]') {    
    buffers.push(new Buffer([BSON.BSON_DATA_BOOLEAN]));
    objectLength += BSON.encodeBoolean(buffers, elementName, value);
  } else if(Array.isArray(value) || toString.call(value) === '[object Array]') {
    buffers.push(new Buffer([BSON.BSON_DATA_ARRAY]));
    objectLength += BSON.encodeArray(buffers, elementName, value);
  } else if(value instanceof Date || toString.call(value) === '[object Date]') {
    buffers.push(new Buffer([BSON.BSON_DATA_DATE]));    
    objectLength += BSON.encodeDate(buffers, elementName, value);    
  } else if(value instanceof ObjectID || (value.id && value.toHexString)) {
    buffers.push(new Buffer([BSON.BSON_DATA_OID]));    
    objectLength += BSON.encodeObjectID(buffers, elementName, value);
  } else if(value instanceof RegExp || toString.call(value) === '[object RegExp]') {
    buffers.push(new Buffer([BSON.BSON_DATA_REGEXP]));    
    objectLength += BSON.encodeRegExp(buffers, elementName, value);    
  } else if(value instanceof Binary) {
    buffers.push(new Buffer([BSON.BSON_DATA_BINARY]));    
    objectLength += BSON.encodeBinary(buffers, elementName, value);    
  } else if(value instanceof DBRef) {
    buffers.push(new Buffer([BSON.BSON_DATA_OBJECT]));    
    objectLength += BSON.encodeDbRef(buffers, elementName, value);        
  } else if(value instanceof Timestamp) {
    buffers.push(new Buffer([BSON.BSON_DATA_TIMESTAMP]));    
    objectLength += BSON.encodeLong(buffers, elementName, value);
  } else if(value instanceof Long) {
    buffers.push(new Buffer([BSON.BSON_DATA_LONG]));    
    objectLength += BSON.encodeLong(buffers, elementName, value);
  } else if(value instanceof Code) {
    buffers.push(new Buffer([BSON.BSON_DATA_CODE_W_SCOPE]));    
    objectLength += BSON.encodeCode(buffers, elementName, value);
  } else if(value instanceof Function || toString.call(value) === '[object Function]') {  // Ignore functions
    return objectLength;
  } else if(typeof value == 'object') {
    buffers.push(new Buffer([BSON.BSON_DATA_OBJECT]));    
    objectLength += BSON.encodeObject(buffers, elementName, value, checkKeys);
  }
  
  // Object length + the byte type
  return objectLength + 1; 
}

BSON.encodeCode = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = binaryutils.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }

  // Set up data
  var codeStringBuffers = [];
  var totalObjectLength = value.code instanceof Function ? BSON.encodeString(codeStringBuffers, null, value.code.toString()) 
                                    : BSON.encodeString(codeStringBuffers, null, value.code);
  var scopeBuffers = [];
  var objectTotalSize = 0;
  
  // If we have a scope variable
  if(null != value.scope) {
    objectTotalSize += BSON.encodeObject(scopeBuffers, null, value.scope);
  } else {
    scopeBuffers.push(binaryutils.encodeInt(5), new Buffer([0]));
    objectTotalSize += 4 + 1;
  }
  
  // Add buffers to list
  buffers.push(binaryutils.encodeInt(totalObjectLength + objectTotalSize + 4));

  // Add code buffers
  for(var i = 0; i < codeStringBuffers.length; i++) buffers.push(codeStringBuffers[i]);
  
  // Add scope buffers
  for(var i = 0; i < scopeBuffers.length; i++) buffers.push(scopeBuffers[i]);
  
  // Return the total length
  return (nameBuffers != null ? nameBuffers[0].length + 1: 0) + totalObjectLength + objectTotalSize + 3 + 1;
}

BSON.encodeLong = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = binaryutils.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }

  var longBuffer = new Buffer(8);
  binaryutils.encodeIntInPlace(value.getLowBits(), longBuffer, 0);
  binaryutils.encodeIntInPlace(value.getHighBits(), longBuffer, 4);

  // Add values to buffer
  buffers.push(longBuffer);
  return (nameBuffers != null ? nameBuffers[0].length + 1: 0) + 8;    
}

BSON.encodeDbRef = function(buffers, name, value) {
  var ordered_values = {
      '$ref': value.namespace
    , '$id' : value.oid
  };

  if(null != value.db) {
    ordered_values['$db'] = value.db;
  }
  
  // Serialize the dbref object
  return BSON.encodeObject(buffers, name, ordered_values);
}

BSON.encodeBinary = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = binaryutils.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }
  
  var data = value.value(true);
  // Add values to buffer
  buffers.push(binaryutils.encodeInt(data.length));
  buffers.push(new Buffer([value.sub_type]), data);  
  return (nameBuffers != null ? nameBuffers[0].length + 1: 0) + data.length + 1 + 4;    
}

BSON.encodeRegExp = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = binaryutils.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }
  
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
  
  // Don't need to sort the alphabetically as it's already done by javascript on creation of a Regexp obejct
  options = options_array.join('');
  
  // Unpack variables
  var cleanRegExpBuffer = binaryutils.encodeCString(clean_regexp);
  var optionsBuffer = binaryutils.encodeCString(options);
  // Push buffers
  buffers.push(cleanRegExpBuffer[0], cleanRegExpBuffer[1], optionsBuffer[0], optionsBuffer[1]);  
  // Return the length of the element
  return (nameBuffers != null ? nameBuffers[0].length + 1 : 0) + cleanRegExpBuffer[0].length + 1 + optionsBuffer[0].length + 1;    
}

BSON.encodeObjectID = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = binaryutils.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }

  // Unpack variables
  var oidBuffer = new Buffer(12);
  oidBuffer.write(value.id, 0, 'binary');
  buffers.push(oidBuffer);
  
  return (nameBuffers != null ? nameBuffers[0].length + 1 : 0) + 12;  
}

BSON.encodeObject = function(buffers, name, object, checkKeys) {
  // Contain all the subparts of the object
  var objectBuffers = [];
  // Push data object header
  var objectLength = 0;

  for(var elementName in object) {
    var value = object[elementName];
    objectLength += BSON.encodeValue(objectBuffers, elementName, value, checkKeys);
  }
  
  if(name != null) {
    // Encode name buffer
    var nameBuffers = binaryutils.encodeCString(name);    
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }
  
  // Build up the object
  buffers.push(binaryutils.encodeInt(objectLength + 4 + 1));  
  
  // Add all buffers from object
  for(var i = 0; i < objectBuffers.length; i++) {
    buffers.push(objectBuffers[i]);   
  }
  
  // Push ending zero
  buffers.push(new Buffer([0]));    
  // Return total size of the document
  return objectLength + 4 + 1 + (nameBuffers != null ? nameBuffers[0].length + 1 : 0);
} 

var locate_chr_end_index = function(data, locate_value, index) {        
  for(var i = index; i < data.length; i++) {
    if(data[i] == locate_value) return i;
  }
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
BSON.deserialize = function(data, is_array_item, returnData, returnArray) {
  // The return data
  var return_data = {};
  var return_array = [];
  // Index of decoding in the binary file
  var index = 0;
  // Split of the first 4 characters to get the number of bytes
  var size = binaryutils.decodeUInt32(data, 0);
  
  // Adjust index
  index = index + 4;

  while(index < data.length) {
    // Read the first byte indicating the type of object
    var type = binaryutils.decodeUInt8(data, index);
    // Start index
    var insert_index = 0;
    // Adjust for the type of element
    index = index + 1;
    // If it's a string decode the value
    switch (type) {
      case BSON.BSON_DATA_STRING:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = locate_chr_end_index(data, 0, index);
        var string_name = data.toString('utf8', index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the length of the string (next 4 bytes)
        var string_size = binaryutils.decodeUInt32(data, index);
        // Adjust the index to point at start of string
        index = index + 4;
        // Read the string
        var value = data.toString('utf8', index, index + string_size - 1);
        // Adjust the index with the size of the string
        index = index + string_size;
        // Set the data on the object
        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;

      case BSON.BSON_DATA_NULL:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = locate_chr_end_index(data, 0, index);
        var string_name = data.toString('utf8', index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;
        var value = null;

        // Set the data on the object
        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;

      case BSON.BSON_DATA_INT:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = locate_chr_end_index(data, 0, index);
        var string_name = data.toString('utf8', index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the number value
        var value = binaryutils.decodeUInt32(data, index);
        // Adjust the index with the size
        index = index + 4;
        // Set the data on the object
        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;
   
      case BSON.BSON_DATA_TIMESTAMP:
      case BSON.BSON_DATA_LONG:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = locate_chr_end_index(data, 0, index);
        var string_name = data.toString('utf8', index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the number value
        var low_bits = binaryutils.decodeUInt32(data, index);
        var high_bits = binaryutils.decodeUInt32(data, index + 4);
        // Create to integers
        // var value = new Long(low_bits, high_bits);
        var value = type == BSON.BSON_DATA_LONG ? new Long(low_bits, high_bits) : new Timestamp(low_bits, high_bits);
        // Adjust the index with the size
        index = index + 8;
        // Set the data on the object
        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;

      case BSON.BSON_DATA_NUMBER:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = locate_chr_end_index(data, 0, index);
        var string_name = data.toString('utf8', index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the number value
        var value = ieee754.readIEEE754(data, index, 'little', 52, 8);     
        // Adjust the index with the size
        index = index + 8;
        // Set the data on the object
        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;
   
      case BSON.BSON_DATA_OBJECT:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = locate_chr_end_index(data, 0, index);
        var string_name = data.toString('utf8', index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the size of the object
        var object_size = binaryutils.decodeUInt32(data, index);
        // Do a substr based on the size and parse the sub object
        var object_data = data.slice(index, index + object_size);
        // Parse the object
        var value = BSON.deserialize(object_data, false);
        // Adjust the index for the next value
        index = index + object_size;
        // Set the data on the object
        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;

      case BSON.BSON_DATA_ARRAY:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = locate_chr_end_index(data, 0, index);
        var string_name = data.toString('utf8', index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the size of the object
        var array_size = binaryutils.decodeUInt32(data, index);
        // Let's split off the data and parse all elements (keeping in mind the elements)
        var array_data = data.slice(index, index + array_size);
        // Parse the object
        var value = BSON.deserialize(array_data, true);
        // Adjust the index for the next value
        index = index + array_size;
        // Set the data on the object
        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;
   
      case BSON.BSON_DATA_BOOLEAN:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = locate_chr_end_index(data, 0, index);
        var string_name = data.toString('utf8', index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the length of the string (next 4 bytes)
        var boolean_value = binaryutils.decodeUInt8(data, index);
        var value = boolean_value == 1 ? true : false;
        // Adjust the index
        index = index + 1;
        // Set the data on the object
        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;
   
      case BSON.BSON_DATA_DATE:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = locate_chr_end_index(data, 0, index);
        var string_name = data.toString('utf8', index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the number value
        var low_bits = binaryutils.decodeUInt32(data, index);
        var high_bits = binaryutils.decodeUInt32(data, index + 4);
    
        // Create to integers
        var value_in_seconds = new Long(low_bits, high_bits).toNumber();
        // Calculate date with miliseconds
        var value = new Date();
        value.setTime(value_in_seconds);
        // Adjust the index
        index = index + 8;

        // Set the data on the object
        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;
   
      case BSON.BSON_DATA_OID:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = locate_chr_end_index(data, 0, index);
        var string_name = data.toString('utf8', index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the oid (12 bytes)
        var oid = data.toString('binary', index, index + 12);
        // Calculate date with miliseconds
        var value = new ObjectID(oid);
        // Adjust the index
        index = index + 12;
        // Set the data on the object
        is_array_item ? return_array[insert_index] = value : return_data[string_name] = value;

        // Set the data on the object
        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;
   
      case BSON.BSON_DATA_CODE_W_SCOPE:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = locate_chr_end_index(data, 0, index);
        var string_name = data.toString('utf8', index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Unpack the integer sizes
        var total_code_size = binaryutils.decodeUInt32(data, index)
        index = index + 4;
        var string_size = binaryutils.decodeUInt32(data, index)
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
        // Set the data on the object
        is_array_item ? return_array[insert_index] = value : return_data[string_name] = value;

        // Set the data on the object
        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;
   
      case BSON.BSON_DATA_REGEXP:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = locate_chr_end_index(data, 0, index);
        var string_name = data.toString('utf8', index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // // Read regular expression
        // var end_index = locate_chr_end_index(data, 0, index);
        // var reg_exp = data.slice(index, end_index).toString('binary', 0, (end_index - index));
        // index = end_index + 1;      
        // // Read options
        // var end_index = locate_chr_end_index(data, 0, index);
        // var reg_options = data.slice(index, end_index).toString('binary', 0, (end_index - index));
        // index = end_index + 1;
        // // Regular expression
        // var value = new RegExp(reg_exp, reg_options);
        
        // Read characters until end of regular expression
        var reg_exp_array = [];
        var chr = 1;
        var start_index = index;

        while(data[index] != 0) {
          index = index + 1;
        }

        // RegExp Expression
        reg_exp = data.slice(start_index, index).toString('utf8');
        index = index + 1;

        // Read the options for the regular expression
        var options_array = [];

        while(data[index] != 0) {
          options_array.push(String.fromCharCode(data[index]));
          index = index + 1;
        }

        // Regular expression
        var value = new RegExp(reg_exp, options_array.join(''));
        

        // Set the data on the object
        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;

      case BSON.BSON_DATA_BINARY:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = locate_chr_end_index(data, 0, index);
        var string_name = data.toString('utf8', index, string_end_index);

        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the size of the binary
        var number_of_bytes = binaryutils.decodeUInt32(data, index);
        index = index + 4;

        // Decode the subtype
        var sub_type = binaryutils.decodeUInt8(data, index);
        index = index + 1;
    
        // Read the next bytes into our Binary object
        var bin_data = data.slice(index, index + number_of_bytes);
        // Binary object
        var value = new Binary(bin_data);
        value.sub_type = sub_type;
        // Adjust index with number of bytes
        index = index + number_of_bytes;
        // Set the data on the object
        is_array_item ? return_array[insert_index] = value : return_data[string_name] = value;

        // Set the data on the object
        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;
    }
  }
  
  // Check if we have a db reference
  if(!is_array_item && return_data['$ref'] != null) {
   return_data = new DBRef(return_data['$ref'], return_data['$id'], return_data['$db']);
  }

  // Return the data
  return is_array_item ? return_array : return_data;
};

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
 * Convert bits to Long.
 *
 * @param {int} low_bits
 * @param {int} high_bits
 * @return {Long}
 */
BSON.toLong = function toLong (low_bits, high_bits) {
  // var low_bits = Integer.fromInt(low_bits);
  // var high_bits = Integer.fromInt(high_bits);
  return new Long(low_bits, high_bits);
};

/**
 * Converts value to an Integer.
 *
 * @param {value}
 * @return {Integer}
 */
BSON.toInt = function toInt (value) {
  return Math.floor(value);
};

/**
 * Code constructor.
 *
 * @param {TODO} code
 * @param {TODO} scope
 */

function Code (code, scope) {
  this.code = code;
  this.scope = scope == null ? {} : scope;
};

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
exports.BSON = BSON;
exports.DBRef = DBRef;
exports.Binary = Binary;
exports.ObjectID = ObjectID;
exports.Long = Long;
exports.Timestamp = Timestamp;