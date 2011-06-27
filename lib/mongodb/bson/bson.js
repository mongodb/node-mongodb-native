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
  , ieee754 = require('./float_parser');  

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

BSON.serialize2 = function serialize(object, checkKeys, asBuffer) {
  return BSON.encodeValue('', null, object, true, checkKeys == null ? false : checkKeys);
}

BSON.serialize = function serialize(object, checkKeys, asBuffer) {
  asBuffer = asBuffer == null ? false : asBuffer;
  var buffers = [];

  if(object instanceof Object) {
    var totalLength = BSON._encodeObject(buffers, null, object, true);
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

BSON._encodeNull = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = BSON.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }

  return (nameBuffers != null ? nameBuffers[0].length + 1: 0);    
}

BSON._encodeFloat = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = BSON.encodeCString(name);
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

BSON._encodeDate = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = BSON.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }

  var dateBuffer = new Buffer(8);
  var dateInMilis = Long.fromNumber(value.getTime());
  BSON._encodeIntInPlace(dateInMilis.getLowBits(), dateBuffer, 0);
  BSON._encodeIntInPlace(dateInMilis.getHighBits(), dateBuffer, 4);

  // Add values to buffer
  buffers.push(dateBuffer);
  return (nameBuffers != null ? nameBuffers[0].length + 1: 0) + 8;  
}

BSON._encodeInt32 = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = BSON.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }

  // Unpack variables
  buffers.push(BSON._encodeInt(value));
  return (nameBuffers != null ? nameBuffers[0].length + 1: 0) + 4;
}


BSON._encodeBoolean = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = BSON.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }
  // Unpack variables
  buffers.push(new Buffer([value ? 1 : 0]));
  return (nameBuffers != null ? nameBuffers[0].length + 1: 0) + 1;  
}

BSON._encodeString = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = BSON.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }

  // Unpack variables
  var valueBuffers = BSON.encodeCString(value);

  // Add values to buffer
  buffers.push(BSON._encodeInt(valueBuffers[0].length + 1));
  buffers.push(valueBuffers[0], valueBuffers[1]);
  return (nameBuffers != null ? nameBuffers[0].length + 1: 0) + valueBuffers[0].length + 1 + 4;
}

BSON._encodeArray = function(buffers, name, value) {
  var arrayBuffers = [];
  var arrayTotalLength = 0;
  
  for(var i = 0; i < value.length; i++) {    
    var valueBuffers = [];
    var indexStringBuffers = BSON.encodeCString(i.toString());
    arrayTotalLength += BSON._encodeValue(valueBuffers, null, value[i]) + indexStringBuffers[0].length + 1;
    // Add type and the index string to the array
    arrayBuffers.push(valueBuffers[0], indexStringBuffers[0], indexStringBuffers[1])
    // Add object data minus first field
    for(var j = 1; j < valueBuffers.length; j++) arrayBuffers.push(valueBuffers[j]);
  }
  
  if(name != null) {
    var nameBuffers = BSON.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }

  // Add values to buffer
  buffers.push(BSON._encodeInt(arrayTotalLength + 4 + 1));
  for(var i = 0; i < arrayBuffers.length; i++) buffers.push(arrayBuffers[i])
  buffers.push(new Buffer([0]));
  return (nameBuffers != null ? nameBuffers[0].length + 1: 0) + arrayTotalLength + 4 + 1;
}

BSON._encodeValue = function(buffers, elementName, value, topLevel) {
  var objectLength = 0;

  if(value == null) {
    buffers.push(new Buffer([BSON.BSON_DATA_NULL]));
    objectLength += BSON._encodeNull(buffers, elementName, value);
  } else if(typeof value == 'string') {      
    buffers.push(new Buffer([BSON.BSON_DATA_STRING]));
    objectLength += BSON._encodeString(buffers, elementName, value);
  } else if(typeof value == 'number' && value === parseInt(value, 10)) {
    if(value >= BSON.BSON_INT32_MAX || value < BSON.BSON_INT32_MIN) {      
      buffers.push(new Buffer([BSON.BSON_DATA_LONG]));
      objectLength += BSON._encodeLong(buffers, elementName, Long.fromNumber(value));
    } else {                
      buffers.push(new Buffer([BSON.BSON_DATA_INT]));
      objectLength += BSON._encodeInt32(buffers, elementName, value);
    }
  } else if(typeof value == 'number') {
    buffers.push(new Buffer([BSON.BSON_DATA_NUMBER]));
    objectLength += BSON._encodeFloat(buffers, elementName, value);
  } else if(typeof value == 'boolean') {
    buffers.push(new Buffer([BSON.BSON_DATA_BOOLEAN]));
    objectLength += BSON._encodeBoolean(buffers, elementName, value);
  } else if(Array.isArray(value)) {
    buffers.push(new Buffer([BSON.BSON_DATA_ARRAY]));
    objectLength += BSON._encodeArray(buffers, elementName, value);
  } else if(value instanceof Date) {
    buffers.push(new Buffer([BSON.BSON_DATA_DATE]));    
    objectLength += BSON._encodeDate(buffers, elementName, value);    
  } else if(value instanceof ObjectID || (value.id && value.toHexString)) {
    buffers.push(new Buffer([BSON.BSON_DATA_OID]));    
    objectLength += BSON._encodeObjectID(buffers, elementName, value);
  } else if(value instanceof RegExp) {
    buffers.push(new Buffer([BSON.BSON_DATA_REGEXP]));    
    objectLength += BSON._encodeRegExp(buffers, elementName, value);    
  } else if(value instanceof Binary) {
    buffers.push(new Buffer([BSON.BSON_DATA_BINARY]));    
    objectLength += BSON._encodeBinary(buffers, elementName, value);    
  } else if(value instanceof DBRef) {
    buffers.push(new Buffer([BSON.BSON_DATA_OBJECT]));    
    objectLength += BSON._encodeDbRef(buffers, elementName, value);        
  } else if(value instanceof Timestamp) {
    buffers.push(new Buffer([BSON.BSON_DATA_TIMESTAMP]));    
    objectLength += BSON._encodeLong(buffers, elementName, value);
  } else if(value instanceof Long) {
    buffers.push(new Buffer([BSON.BSON_DATA_LONG]));    
    objectLength += BSON._encodeLong(buffers, elementName, value);
  } else if(value instanceof Code) {
    buffers.push(new Buffer([BSON.BSON_DATA_CODE_W_SCOPE]));    
    objectLength += BSON._encodeCode(buffers, elementName, value);
  } else if(typeof value == 'object') {
    buffers.push(new Buffer([BSON.BSON_DATA_OBJECT]));    
    objectLength += BSON._encodeObject(buffers, elementName, value);
  }
  
  // Object length + the byte type
  return objectLength + 1; 
}

BSON._encodeCode = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = BSON.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }

  // Set up data
  var codeStringBuffers = [];
  var totalObjectLength = BSON._encodeString(codeStringBuffers, null, value.code);
  var scopeBuffers = [];
  var objectTotalSize = 0;
  
  // If we have a scope variable
  if(null != value.scope) {
    objectTotalSize += BSON._encodeObject(scopeBuffers, null, value.scope);
  } else {
    scopeBuffers.push(BSON._encodeInt(5), new Buffer([0]));
    objectTotalSize += 4 + 1;
  }
  
  // Add buffers to list
  buffers.push(BSON._encodeInt(totalObjectLength + objectTotalSize + 4));

  // Add code buffers
  for(var i = 0; i < codeStringBuffers.length; i++) buffers.push(codeStringBuffers[i]);
  
  // Add scope buffers
  for(var i = 0; i < scopeBuffers.length; i++) buffers.push(scopeBuffers[i]);
  
  // Return the total length
  return (nameBuffers != null ? nameBuffers[0].length + 1: 0) + totalObjectLength + objectTotalSize + 3 + 1;
}

BSON._encodeLong = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = BSON.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }

  var longBuffer = new Buffer(8);
  BSON._encodeIntInPlace(value.getLowBits(), longBuffer, 0);
  BSON._encodeIntInPlace(value.getHighBits(), longBuffer, 4);

  // Add values to buffer
  buffers.push(longBuffer);
  return (nameBuffers != null ? nameBuffers[0].length + 1: 0) + 8;    
}

BSON._encodeDbRef = function(buffers, name, value) {
  var ordered_values = {
      '$ref': value.namespace
    , '$id' : value.oid
  };

  if(null != value.db) {
    ordered_values['$db'] = value.db;
  }
  
  // Serialize the dbref object
  return BSON._encodeObject(buffers, name, ordered_values);
}

BSON._encodeBinary = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = BSON.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }
  
  var data = value.value(true);
  // Add values to buffer
  buffers.push(BSON._encodeInt(data.length));
  buffers.push(new Buffer([value.sub_type]), data);  
  return (nameBuffers != null ? nameBuffers[0].length + 1: 0) + data.length + 1 + 4;    
}

BSON._encodeRegExp = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = BSON.encodeCString(name);
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
  var cleanRegExpBuffer = BSON.encodeCString(clean_regexp);
  var optionsBuffer = BSON.encodeCString(options);
  // Push buffers
  buffers.push(cleanRegExpBuffer[0], cleanRegExpBuffer[1], optionsBuffer[0], optionsBuffer[1]);  
  // Return the length of the element
  return (nameBuffers != null ? nameBuffers[0].length + 1 : 0) + cleanRegExpBuffer[0].length + 1 + optionsBuffer[0].length + 1;    
}

BSON._encodeObjectID = function(buffers, name, value) {
  if(name != null) {
    var nameBuffers = BSON.encodeCString(name);
    // Add values to buffer
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }

  // Unpack variables
  var oidBuffer = new Buffer(12);
  oidBuffer.write(value.id, 0, 'binary');
  buffers.push(oidBuffer);
  
  return (nameBuffers != null ? nameBuffers[0].length + 1 : 0) + 12;  
}

BSON._encodeObject = function(buffers, name, object, topLevel) {
  // Contain all the subparts of the object
  var objectBuffers = [];
  // Push data object header
  var objectLength = 0;

  // Serialize the elements
  for(var elementName in object) {
    var value = object[elementName];
    objectLength += BSON._encodeValue(objectBuffers, elementName, value, topLevel);
  }
  
  if(name != null) {
    // Encode name buffer
    var nameBuffers = BSON.encodeCString(name);    
    buffers.push(nameBuffers[0], nameBuffers[1]);    
  }
  
  // Build up the object
  buffers.push(BSON._encodeInt(objectLength + 4 + 1));  
  
  // Add all buffers from object
  for(var i = 0; i < objectBuffers.length; i++) {
    buffers.push(objectBuffers[i]);   
  }
  
  // Push ending zero
  buffers.push(new Buffer([0]));    
  // Return total size of the document
  return objectLength + 4 + 1 + (nameBuffers != null ? nameBuffers[0].length + 1 : 0);
} 

BSON._encodeInt = function(value) {
  var buffer = new Buffer(4);
  buffer[3] = (value >> 24) & 0xff;      
  buffer[2] = (value >> 16) & 0xff;
  buffer[1] = (value >> 8) & 0xff;
  buffer[0] = value & 0xff;
  return buffer;
}

BSON._encodeIntInPlace = function(value, buffer, index) {
  buffer[index + 3] = (value >> 24) & 0xff;			
	buffer[index + 2] = (value >> 16) & 0xff;
	buffer[index + 1] = (value >> 8) & 0xff;
	buffer[index] = value & 0xff;
}

BSON.encodeCString = function(string) {
  var buf = new Buffer(string, 'utf8');
  return [buf, new Buffer([0])];
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

BSON.deserialize = function deserialize (data, is_array_item, returnData, returnArray) {
  // The return data
  var return_data = {};
  var return_array = [];

  // Index of decoding in the binary file
  var index = 0;

  // Split of the first 4 characters to get the number of bytes
  var size = BinaryParser.toInt(data.substr(0, 4));

  // Adjust index
  index = index + 4;

  while(index < data.length) {
    // Read the first byte indicating the type of object
    var type = BinaryParser.toSmall(data.substr(index, 1));

    // Adjust for the type of element
    index = index + 1;

    switch (type) {
      case BSON.BSON_DATA_STRING:

        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);

        // UTF-8 decode key name
        string_name = BinaryParser.decode_utf8(string_name);

        // 
        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the length of the string (next 4 bytes)
        var string_size = BinaryParser.toInt(data.substr(index, 4));

        // Adjust the index to point at start of string
        index = index + 4;

        // Read the string
        var value = BinaryParser.decode_utf8(data.substr(index, string_size - 1));

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
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);

        // UTF-8 decode key name
        // string_name = decodeURIComponent(escape(string_name));
        string_name = BinaryParser.decode_utf8(string_name);

        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Set the data on the object
        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = null;
        } else {
          return_data[string_name] = null;
        }

        break;

      case BSON.BSON_DATA_INT:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);

        // UTF-8 decode key name
        // string_name = decodeURIComponent(escape(string_name));
        string_name = BinaryParser.decode_utf8(string_name);

        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the number value
        var value = BinaryParser.toInt(data.substr(index, 4));

        // Adjust the index with the size
        index = index + 4;

        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;

      case BSON.BSON_DATA_LONG:
      case BSON.BSON_DATA_TIMESTAMP:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);

        // UTF-8 decode key name
        // string_name = decodeURIComponent(escape(string_name));
        string_name = BinaryParser.decode_utf8(string_name);

        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the number value
        var low_bits = BinaryParser.toInt(data.substr(index, 4));
        var high_bits = BinaryParser.toInt(data.substr(index + 4, 4));
        var value = new Long(low_bits, high_bits);

        // Adjust the index with the size
        index = index + 8;

        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;

      case BSON.BSON_DATA_NUMBER:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);

        // UTF-8 decode key name
        // string_name = decodeURIComponent(escape(string_name));
        string_name = BinaryParser.decode_utf8(string_name);

        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the number value
        var value = BinaryParser.toDouble(data.substr(index, 8));

        // Adjust the index with the size
        index = index + 8;

        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;

      case BSON.BSON_DATA_OBJECT:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);

        // UTF-8 decode key name
        // string_name = decodeURIComponent(escape(string_name));
        string_name = BinaryParser.decode_utf8(string_name);

        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the size of the object
        var object_size = BinaryParser.toInt(data.substr(index, 4));

        // Do a substr based on the size and parse the sub object
        var object_data = data.substr(index, object_size);

        // Parse the object
        var value = BSON.deserialize(object_data, false);

        // Adjust the index for the next value
        index = index + object_size;
        
        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;

      case BSON.BSON_DATA_ARRAY:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);

        // UTF-8 decode key name
        // string_name = decodeURIComponent(escape(string_name));
        string_name = BinaryParser.decode_utf8(string_name);

        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the size of the object
        var array_size = BinaryParser.toInt(data.substr(index, 4));

        // Let's split off the data and parse all elements (keeping in mind the elements)
        var array_data = data.substr(index, array_size);

        // Parse the object
        var value = BSON.deserialize(array_data, true);

        // Adjust the index for the next value
        index = index + array_size;

        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;

      case BSON.BSON_DATA_BOOLEAN:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);

        // UTF-8 decode key name
        // string_name = decodeURIComponent(escape(string_name));
        string_name = BinaryParser.decode_utf8(string_name);

        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the length of the string (next 4 bytes)
        var boolean_value = BinaryParser.toSmall(data.substr(index, 1));
        var value = 1 === boolean_value;

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
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);

        // UTF-8 decode key name
        // string_name = decodeURIComponent(escape(string_name));
        string_name = BinaryParser.decode_utf8(string_name);

        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the number value
        var low_bits = BinaryParser.toInt(data.substr(index, 4));
        var high_bits = BinaryParser.toInt(data.substr(index + 4, 4));

        // Create to integers
        var value_in_seconds = new Long(low_bits, high_bits).toNumber();

        // Calculate date with miliseconds
        var value = new Date();
        value.setTime(value_in_seconds);

        // Adjust the index
        index = index + 8;

        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;

      case BSON.BSON_DATA_OID:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);

        // UTF-8 decode key name
        // string_name = decodeURIComponent(escape(string_name));
        string_name = BinaryParser.decode_utf8(string_name);

        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the oid (12 bytes)
        var oid = data.substr(index, 12);

        // Calculate date with miliseconds
        var value = new ObjectID(oid);

        // Adjust the index
        index = index + 12;

        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;

      case BSON.BSON_DATA_CODE_W_SCOPE:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);

        // UTF-8 decode key name
        // string_name = decodeURIComponent(escape(string_name));
        string_name = BinaryParser.decode_utf8(string_name);

        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Unpack the integer sizes
        var total_code_size = BinaryParser.toInt(data.substr(index, 4));
        index = index + 4;
        var string_size = BinaryParser.toInt(data.substr(index, 4));
        index = index + 4;

        // Read the string + terminating null
        var code_string = BinaryParser.decode_utf8(data.substr(index, string_size - 1));
        index = index + string_size;

        // Get the bson object
        var bson_object_size = total_code_size - string_size - 8;
        var bson_object_string = data.substr(index, bson_object_size);
        index = index + bson_object_size;

        // Parse the bson object
        var scope_object = BSON.deserialize(bson_object_string, false);

        // Create code object
        var value = new exports.Code(code_string, scope_object);

        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;

      case BSON.BSON_DATA_REGEXP:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);

        // UTF-8 decode key name
        // string_name = decodeURIComponent(escape(string_name));
        string_name = BinaryParser.decode_utf8(string_name);

        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read characters until end of regular expression
        var reg_exp_array = [];
        var chr = 1;
        var start_index = index;

        while(BinaryParser.toByte((chr = data.charAt(index))) != 0) {
          ++index;
        }

        // RegExp Expression
        reg_exp = data.substring(start_index, index);
        index = index + 1;

        // Read the options for the regular expression
        var options_array = [];

        while(BinaryParser.toByte((chr = data.charAt(index++))) != 0) {
          options_array.push(chr);
        }

        // Regular expression
        var value = new RegExp(BinaryParser.decode_utf8(reg_exp), options_array.join(''));

        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;

      case BSON.BSON_DATA_BINARY:
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);

        // UTF-8 decode key name
        string_name = BinaryParser.decode_utf8(string_name);

        // Ajust index to point to the end of the string
        index = string_end_index + 1;

        // Read the size of the binary
        var number_of_bytes = BinaryParser.toInt(data.substr(index, 4));
        index = index + 4;

        // Decode the subtype
        var sub_type = BinaryParser.toByte(data.substr(index, 1));
        index = index + 1;

        // Binary object
        var value = new Binary();
        value.sub_type = sub_type;

        // Read the next bytes into our Binary object
        var bin_data = data.substr(index, number_of_bytes);
        value.write(bin_data);

        // Adjust index with number of bytes
        index = index + number_of_bytes;

        if (is_array_item) {
          return_array[parseInt(string_name, 10)] = value;
        } else {
          return_data[string_name] = value;
        }

        break;
    }
  }

  // Check if we have a db reference
  if(!is_array_item && null != return_data['$ref']) {
    return_data = new exports.DBRef( return_data['$ref']
                                   , return_data['$id']
                                   , return_data['$db']);
  }

  // Return the data
  return is_array_item
    ? return_array
    : return_data;
};

/**
 * Encode an Int as BSON.
 *
 * @param {TODO} number
 * @return {TODO}
 */

BSON.encodeInt = function encodeInt (number) {
  return BinaryParser.fromInt(number);
};

/**
 * Encode a Long as BSON.
 *
 * @param {TODO} number
 * @return {TODO}
 */

BSON.encodeLong = function encodeLong (number) {
  return BinaryParser.fromInt(number.getLowBits())
       + BinaryParser.fromInt(number.getHighBits());
};

/**
 * Encode a Float as BSON.
 *
 * @param {TODO} number
 * @return {TODO}
 */

BSON.encodeFloat = function encodeFloat (number) {
  return BinaryParser.fromDouble(number);
};

/**
 * Encode an array as BSON.
 *
 * @param {TODO} array
 * @param {Bool} checkKeys - TODO
 * @return {TODO}
 */

BSON.encodeArray = function encodeArray (array, checkKeys) {
  var encoded_string = '';
  var index = 0;
  var len = array.length;

  for(; index < len; ++index) {
    var index_string = new String(index) + BinaryParser.fromByte(0);
    var encoded_object = BSON.encodeValue('', null, array[index], false, checkKeys);
    encoded_string += encoded_object.substr(0, 1) + index_string + encoded_object.substr(1);
  }

  return encoded_string;
};

/**
 * Encode an object as BSON.
 *
 * @param {TODO} object
 * @param {Bool} checkKeys - TODO
 * @return {TODO}
 */

// BSON.encodeObject = function encodeObject (buffers, object, checkKeys) {
//   // var encoded_string = '';
//   
//   
//   var keys = Object.keys(object);
//   var len = keys.length;
//   var key, val;
// 
//   for (var i = 0; i < len; ++i) {
//     key = keys[i];
//     val = object[key];
//     if(null == val || (val != null && val.constructor != Function)) {
//       // encoded_string += BSON.encodeValue('', key, val, false, checkKeys);
//       var objectBuffers = BSON.encodeValue([], key, val, false, checkKeys);
//       var objectLength = 0;
//       for(var i = 0; i < objectBuffers.length; i++) objectLength += objectBuffers[i].length;
//       
//       objectBuffers.unshift()
//     }
//   }
// 
//   // encoded_string += (!top_level ? BinaryParser.fromByte(BSON.BSON_DATA_OBJECT) : '')
//   //                 + variable_encoded
//   //                 + BSON.encodeInt(object_string.length + 4 + 1)
//   //                 + object_string
//   //                 + BinaryParser.fromByte(0);
// 
// 
//   // return buffers;
// };

/**
 * Encode a boolean as BSON.
 *
 * @param {TODO} bool
 * @return {TODO}
 */

BSON.encodeBoolean = function encodeBoolean (bool) {
  return BinaryParser.fromSmall(bool ? 1 : 0);
};

/**
 * Encode a date as BSON.
 *
 * @param {TODO} date
 * @return {TODO}
 */

BSON.encodeDate = function encodeDate (date) {
  var dateInMilis = Long.fromNumber(date.getTime());
  return BinaryParser.fromInt(dateInMilis.getLowBits())
       + BinaryParser.fromInt(dateInMilis.getHighBits());
};

/**
 * Encode a ObjectId as BSON.
 *
 * @param {ObjectId} oid
 * @return {TODO}
 */

BSON.encodeOid = function encodeOid (oid) {
  return oid.id;
};

/**
 * Encode a CodeString as BSON.
 *
 * @param {TODO} code
 * @param {Bools} checkKeys
 * @return {TODO}
 */

BSON.encodeCode = function encodeCode (code, checkKeys) {
  var code_string = BSON.encodeString(code.code);
  var scope = BinaryParser.fromInt(5) + BinaryParser.fromByte(0);

  // Encode the scope (a hash of values or ordered hash)
  if(null != code.scope) {
    scope = BSON.encodeValue('', null, code.scope, false, checkKeys);
    scope = scope.substring(1, scope.length);
  }

  // Calculate lengths
  var total_length = code_string.length - 4 + scope.length + 8;

  return BinaryParser.fromInt(total_length) + code_string + scope;
};

/**
 * Encode a RegExp as BSON.
 *
 * @param {RegExp} regexp
 * @return {TODO}
 */

BSON.encodeRegExp = function encodeRegExp (regexp) {
  var options_array = [];
  var str = regexp.toString();
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

  // Encode the regular expression
  return BinaryParser.encode_cstring(clean_regexp)
       + BinaryParser.encode_cstring(options);
};

/**
 * Encode a binary as BSON.
 *
 * @param {TODO} binary
 * @return {TODO}
 */

BSON.encodeBinary = function encodeBinary (binary) {
  var data = binary.value();
  return BinaryParser.fromInt(data.length) + BinaryParser.fromByte(binary.sub_type) + data;
};

/**
 * Encode a DBRef as BSON.
 *
 * @param {TODO} dbref
 * @return {TODO}
 */

BSON.encodeDBRef = function encodeDBRef (dbref) {
  var ordered_values = {
      '$ref': dbref.namespace
    , '$id' : dbref.oid
  };

  if(null != dbref.db) {
    ordered_values['$db'] = dbref.db;
  }

  return BSON.encodeObject(ordered_values);
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
 * Encodes value as BSON.
 *
 * @param {TODO} encoded_string
 * @param {TODO} variable
 * @param {TODO} value
 * @param {TODO} top_level
 * @param {TODO} checkKeys
 * @return {String}
 */

 // Encode a cstring
 BinaryParser.encode_cstring = function encode_cstring (s) {
   return unescape(encodeURIComponent(s)) + BinaryParser.fromByte(0);
 };

// BSON.encodeCString = function(buffers, string) {
//   var buf = new Buffer(string, 'utf8');
//   buffers.push(buf, new Buffer([0]));
// }

BSON.encodeValue = function encodeValue (encoded_string, variable, value, top_level, checkKeys) {
  var toString = Object.prototype.toString;

  var variable_encoded = variable == null
    ? ''
    : BinaryParser.encode_cstring(variable);

  if(checkKeys && variable != null) {
    BSON.checkKey(variable);
  }
  
  if(value == null) {
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_NULL)
                    + variable_encoded;
  } else if(value.constructor == String) {
    var v = BinaryParser.fromByte(BSON.BSON_DATA_STRING)
                    + variable_encoded
                    + BSON.encodeString(value);
                    
    encoded_string += v;
                    
  } else if(value instanceof Timestamp || toString.call(value) == "[object Timestamp]") {
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_TIMESTAMP)
                    + variable_encoded
                    + BSON.encodeLong(value);
  } else if(value instanceof Long || toString.call(value) == "[object Long]") {
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_LONG)
                    + variable_encoded
                    + BSON.encodeLong(value);
  } else if(value.constructor == Number && value === parseInt(value, 10)) {
    if(value > BSON.BSON_INT32_MAX || value < BSON.BSON_INT32_MIN) {
      encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_LONG)
                      + variable_encoded
                      + BSON.encodeLong(Long.fromNumber(value));
    } else {
      encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_INT)
                      + variable_encoded
                      + BSON.encodeInt(value);
    }
  } else if(value.constructor == Number) {
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_NUMBER)
                    + variable_encoded
                    + BSON.encodeFloat(value);
  } else if(Array.isArray(value)) {
    var object_string = BSON.encodeArray(value, checkKeys);
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_ARRAY)
                    + variable_encoded
                    + BSON.encodeInt(object_string.length + 4 + 1)
                    + object_string
                    + BinaryParser.fromByte(0);
  } else if(toString.call(value) === '[object Boolean]') {
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_BOOLEAN)
                    + variable_encoded
                    + BSON.encodeBoolean(value);
  } else if(toString.call(value) === '[object Date]') {
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_DATE)
                    + variable_encoded
                    + BSON.encodeDate(value);
  } else if(toString.call(value) === '[object RegExp]') {
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_REGEXP)
                    + variable_encoded
                    + BSON.encodeRegExp(value);
  } else if(value instanceof ObjectID ||
           (value.id && value.toHexString) ||
           toString.call(value) === '[object ObjectID]') {
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_OID)
                    + variable_encoded
                    + BSON.encodeOid(value);
  } else if(value instanceof Code || toString.call(value) == "[object Code]") {
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_CODE_W_SCOPE)
                    + variable_encoded
                    + BSON.encodeCode(value, checkKeys);
  } else if(value instanceof Binary || toString.call(value) == "[object Binary]") {    
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_BINARY)
                    + variable_encoded
                    + BSON.encodeBinary(value);
  } else if(value instanceof DBRef) {
    var object_string = BSON.encodeDBRef(value);
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_OBJECT)
                    + variable_encoded
                    + BSON.encodeInt(object_string.length + 4 + 1)
                    + object_string
                    + BinaryParser.fromByte(0);
  } else if(toString.call(value) === '[object Object]') {
    var object_string = BSON.encodeObject(value, checkKeys);
    encoded_string += (!top_level ? BinaryParser.fromByte(BSON.BSON_DATA_OBJECT) : '')
                    + variable_encoded
                    + BSON.encodeInt(object_string.length + 4 + 1)
                    + object_string
                    + BinaryParser.fromByte(0);
  }

  return encoded_string;
};

/**
 * Encode an object as BSON.
 *
 * @param {TODO} object
 * @param {Bool} checkKeys - TODO
 * @return {TODO}
 */
BSON.encodeObject = function encodeObject (object, checkKeys) {
  var encoded_string = '';
  var keys = Object.keys(object);
  var len = keys.length;
  var key, val;

  for (var i = 0; i < len; ++i) {
    key = keys[i];
    val = object[key];
    if(null == val || (val != null && val.constructor != Function)) {
      encoded_string += BSON.encodeValue('', key, val, false, checkKeys);
    }
  }

  return encoded_string;
};

/**
 * Encode a string as BSON.
 *
 * @param {TODO} string
 * @return {TODO}
 */

BSON.encodeString = function encodeString (string) {
  var encodedString = BinaryParser.encode_cstring(string);
  // Encode the string as binary with the length
  return BinaryParser.fromInt(encodedString.length) + encodedString;
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