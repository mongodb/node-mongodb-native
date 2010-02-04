require('mongodb/lang/oo');

var mongo = require('mongodb/bson/collections');
process.mixin(mongo, require('mongodb/goog/math/long'));
process.mixin(mongo, require('mongodb/goog/math/integer'));
process.mixin(mongo, require('mongodb/bson/binary_parser'));

// Alias a string function
var chr = String.fromCharCode;

exports.BSON = Class({
})

// BSON DATA TYPES
exports.BSON.BSON_DATA_NUMBER = 1;
exports.BSON.BSON_DATA_STRING = 2;
exports.BSON.BSON_DATA_OBJECT = 3;
exports.BSON.BSON_DATA_ARRAY = 4;
exports.BSON.BSON_DATA_BINARY = 5;
exports.BSON.BSON_DATA_OID = 7;
exports.BSON.BSON_DATA_BOOLEAN = 8;
exports.BSON.BSON_DATA_DATE = 9;
exports.BSON.BSON_DATA_NULL = 10;
exports.BSON.BSON_DATA_REGEXP = 11;
exports.BSON.BSON_DATA_CODE_W_SCOPE = 15;
exports.BSON.BSON_DATA_INT = 16;
exports.BSON.BSON_DATA_TIMESTAMP = 17;
exports.BSON.BSON_DATA_LONG = 18;

// BSON BINARY DATA SUBTYPES
exports.BSON.BSON_BINARY_SUBTYPE_FUNCTION = 1;
exports.BSON.BSON_BINARY_SUBTYPE_BYTE_ARRAY = 2;
exports.BSON.BSON_BINARY_SUBTYPE_UUID = 3;
exports.BSON.BSON_BINARY_SUBTYPE_MD5 = 4;
exports.BSON.BSON_BINARY_SUBTYPE_USER_DEFINED = 128;

exports.BSON.serialize = function(data, checkKeys) {
  return exports.BSON.encodeValue('', null, data, true, checkKeys == null ? false : checkKeys);
}

exports.BSON.deserialize = function(data) {
  return exports.BSON.deserialize(data, false);
}
exports.BSON.deserialize = function(data, is_array_item, returnData, returnArray) {  
  // The return data 
  var return_data = new mongo.OrderedHash();
  var return_array = [];
  // Index of decoding in the binary file
  var index = 0;
  // Split of the first 4 characters to get the number of bytes
  var size = mongo.BinaryParser.toInt(data.substr(0, 4));
  // Adjust index
  index = index + 4;
  
  while(index < data.length) {
    // Read the first byte indicating the type of object
    var type = mongo.BinaryParser.toSmall(data.substr(index, 1));
    var insert_index = 0;
    
    // Adjust for the type of element
    index = index + 1;
    // If it's a string decode the value
    if(type == exports.BSON.BSON_DATA_STRING) {      
      if(!is_array_item) {
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;
      } else {        
        insert_index = parseInt(data.substr(index, 2));
        index = index + 2;
      }

      // Read the length of the string (next 4 bytes)
      var string_size = mongo.BinaryParser.toInt(data.substr(index, 4));
      // Adjust the index to point at start of string
      index = index + 4;
      // Read the string
      var value = data.substr(index, string_size - 1);
      // Adjust the index with the size of the string
      index = index + string_size;
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == exports.BSON.BSON_DATA_NULL) {
      if(!is_array_item) {
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;
      } else {
        insert_index = parseInt(data.substr(index, 2));
        index = index + 2;
      }
      // Set the data on the object
      is_array_item ? return_array[insert_index] = null : return_data.add(string_name, null);      
    } else if(type == exports.BSON.BSON_DATA_INT) {
      if(!is_array_item) {
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;
      } else {
        insert_index = parseInt(data.substr(index, 2));
        index = index + 2;
      }
      // Read the number value
      var value = mongo.BinaryParser.toInt(data.substr(index, 4));
      // Adjust the index with the size
      index = index + 4;
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == exports.BSON.BSON_DATA_LONG) {
      if(!is_array_item) {
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;
      } else {
        insert_index = parseInt(data.substr(index, 2));
        index = index + 2;
      }
      // Read the number value
      var low_bits = mongo.Integer.fromInt(mongo.BinaryParser.toInt(data.substr(index, 4)));
      var high_bits = mongo.Integer.fromInt(mongo.BinaryParser.toInt(data.substr(index + 4, 4)));
      // Create to integers
      var value = new mongo.Long(low_bits, high_bits);
      // Adjust the index with the size
      index = index + 8;
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == exports.BSON.BSON_DATA_NUMBER) {
      if(!is_array_item) {
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;
      } else {
        insert_index = parseInt(data.substr(index, 2));
        index = index + 2;
      }
      // Read the number value
      var value = mongo.BinaryParser.toDouble(data.substr(index, 8));
      // Adjust the index with the size
      index = index + 8;
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == exports.BSON.BSON_DATA_OBJECT) {
      if(!is_array_item) {
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;
      } else {
        insert_index = parseInt(data.substr(index, 2));
        index = index + 2;
      }      
      // Read the size of the object
      var object_size = mongo.BinaryParser.toInt(data.substr(index, 4));
      // Do a substr based on the size and parse the sub object
      var object_data = data.substr(index, object_size);
      // Parse the object
      var value = exports.BSON.deserialize(object_data, false);
      // Adjust the index for the next value
      index = index + object_size;
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == exports.BSON.BSON_DATA_ARRAY) {
      if(!is_array_item) {
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;
      } else {
        insert_index = parseInt(data.substr(index, 2));
        index = index + 2;
      }
      // Read the size of the object
      var array_size = mongo.BinaryParser.toInt(data.substr(index, 4));
      // Let's split off the data and parse all elements (keeping in mind the elements)
      var array_data = data.substr(index, array_size);
      // Parse the object
      var value = exports.BSON.deserialize(array_data, true);
      // Adjust the index for the next value
      index = index + array_size;
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == exports.BSON.BSON_DATA_BOOLEAN) {
      if(!is_array_item) {
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;
      } else {
        insert_index = parseInt(data.substr(index, 2));
        index = index + 2;
      }
      // Read the length of the string (next 4 bytes)
      var boolean_value = mongo.BinaryParser.toSmall(data.substr(index, 1));
      var value = boolean_value == 1 ? true : false;
      // Adjust the index
      index = index + 1;
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == exports.BSON.BSON_DATA_DATE) {
      if(!is_array_item) {
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;
      } else {
        insert_index = parseInt(data.substr(index, 2));
        index = index + 2;
      }
      // Read the date (8 bytes)
      var value_in_seconds = mongo.BinaryParser.toQWord(data.substr(index, 8));
      // Calculate date with miliseconds
      var value = new Date();
      value.setTime(value_in_seconds * 1000);
      // Adjust the index
      index = index + 8;
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == exports.BSON.BSON_DATA_OID) {
      if(!is_array_item) {
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;
      } else {
        insert_index = parseInt(data.substr(index, 2));
        index = index + 2;
      }      
      // Read the oid (12 bytes)
      var oid = data.substr(index, 12);
      // Calculate date with miliseconds
      var value = new exports.ObjectID(oid);
      // Adjust the index
      index = index + 12;
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == exports.BSON.BSON_DATA_CODE_W_SCOPE) {
      if(!is_array_item) {
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;
      } else {
        insert_index = parseInt(data.substr(index, 2));
        index = index + 2;
      }            
      // Unpack the integer sizes
      var total_code_size = mongo.BinaryParser.toInt(data.substr(index, 4));
      index = index + 4;
      var string_size = mongo.BinaryParser.toInt(data.substr(index, 4));
      index = index + 4;
      // Read the string + terminating null
      var code_string = mongo.BinaryParser.decode_utf8(data.substr(index, string_size - 1));
      index = index + string_size;
      // Get the bson object
      var bson_object_size = total_code_size - string_size - 8;
      var bson_object_string = data.substr(index, bson_object_size);
      index = index + bson_object_size;
      // Parse the bson object
      var scope_object = exports.BSON.deserialize(bson_object_string, false);
      // Create code object
      var value = new exports.Code(code_string, scope_object);
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == exports.BSON.BSON_DATA_REGEXP) {
      if(!is_array_item) {
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;
      } else {
        insert_index = parseInt(data.substr(index, 2));
        index = index + 2;
      }      
      // Read characters until end of regular expression
      var reg_exp_array = [];
      var chr = 1;
      while(mongo.BinaryParser.toByte((chr = data.charAt(index++))) != 0) {
        reg_exp_array.push(chr);
      }
      // Read the options for the regular expression
      var options_array = [];
      while(mongo.BinaryParser.toByte((chr = data.charAt(index++))) != 0) {
        options_array.push(chr);
      }
      // Regular expression
      var value = new RegExp(reg_exp_array.join(''), options_array.join(''));
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == exports.BSON.BSON_DATA_BINARY) {
      if(!is_array_item) {
        // Read the null terminated string (indexof until first 0)
        var string_end_index = data.indexOf('\0', index);
        var string_name = data.substring(index, string_end_index);
        // Ajust index to point to the end of the string
        index = string_end_index + 1;
      } else {
        insert_index = parseInt(data.substr(index, 2));
        index = index + 2;
      }      
      // The total number of bytes after subtype
      var total_number_of_bytes = mongo.BinaryParser.toInt(data.substr(index, 4));
      index = index + 4;
      // Decode the subtype
      var sub_type = mongo.BinaryParser.toByte(data.substr(index, 1));
      index = index + 1;
      // Binary object
      var value = new exports.Binary();
      value.sub_type = sub_type;
      // Read the size of the binary
      var number_of_bytes = mongo.BinaryParser.toInt(data.substr(index, 4));
      index = index + 4;
      // Read the next bytes into our Binary object
      var bin_data = data.substr(index, number_of_bytes);
      value.write(bin_data);
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    }
  }
  // Check if we have a db reference 
  if(!is_array_item && return_data.get('$ref') != null) {
    return_data = new exports.DBRef(return_data.get('$ref'), return_data.get('$id'), return_data.get('$db'));
  }
  
  // Return the data
  return is_array_item ? return_array : return_data;
}
  
exports.BSON.encodeString = function(string) {
  // Calculate the string length
  var string_length = string.length + 1;
  // Encode the string as binary with the length
  return mongo.BinaryParser.fromInt(string_length) + mongo.BinaryParser.encode_utf8(string) + mongo.BinaryParser.fromByte(0);
}

exports.BSON.encodeInt = function(number) {
  return mongo.BinaryParser.fromInt(number.toInt());
}

exports.BSON.encodeLong = function(number) {
  return mongo.BinaryParser.fromInt(number.getLowBits()) + mongo.BinaryParser.fromInt(number.getHighBits());
}

exports.BSON.encodeFloat = function(number) {
  return mongo.BinaryParser.fromDouble(number);
}

exports.BSON.encodeArray = function(array, checkKeys) { 
  var encoded_string = '';
   
  for(var index = 0; index < array.length; index++) {
    var index_string = new String(index) + mongo.BinaryParser.fromByte(0);
    var encoded_object = exports.BSON.encodeValue('', null, array[index], false, checkKeys);
    encoded_string += encoded_object.substr(0, 1) + index_string + encoded_object.substr(1);
  }
  
  return encoded_string;
}

exports.BSON.encodeObject = function(object, checkKeys) {
  var encoded_string = '';
  // Keep track of the variable index
  var index = 0;
  // Let's fetch all the variables for the object and encode each
  for(var variable in object) {    
    encoded_string += exports.BSON.encodeValue('', variable, object[variable], false, checkKeys);
    index = index + 1;
  }
  // Return the encoded string
  return encoded_string;
}

exports.BSON.encodeOrderedObject = function(object, checkKeys) {  
  var encoded_string = '';
  // Ensure the id is always first object of ordered hash
  if(object.get('_id') != null) encoded_string += exports.BSON.encodeValue('', '_id', object.get('_id'), false, checkKeys);
  // Encode all other objects in the order provided
  for(var index = 0; index < object.keys().length; index++) {
    var key = object.keys()[index];
    if(key != '_id') encoded_string += exports.BSON.encodeValue('', key, object.get(key), false, checkKeys);
  }
  return encoded_string;
}

exports.BSON.encodeBoolean = function(value) {
  return value ? mongo.BinaryParser.fromSmall(1) : mongo.BinaryParser.fromSmall(0);
}

exports.BSON.encodeDate = function(value) {
  return mongo.BinaryParser.fromQWord(value.getTime() / 1000);
}

exports.BSON.encodeOid = function(oid) {
  return oid.id;
}

exports.BSON.encodeCode = function(code, checkKeys) {  
  // Get the code_string
  var code_string = exports.BSON.encodeString(code.code);
  var scope = mongo.BinaryParser.fromInt(5) + mongo.BinaryParser.fromByte(0);
  // Encode the scope (a hash of values or ordered hash)
  if(code.scope != null) {
    scope = exports.BSON.encodeValue('', null, code.scope, false, checkKeys);
    scope = scope.substring(1, scope.length);
  }
  // Calculate lengths
  var total_length = code_string.length - 4 + scope.length + 8;
  return mongo.BinaryParser.fromInt(total_length) + code_string + scope;
}

exports.BSON.encodeRegExp = function(regexp) {  
  // Get regular expression
  var clean_regexp = regexp.toString().match(/\/.*\//, '');
  clean_regexp = clean_regexp[0].substring(1, clean_regexp[0].length - 1);
  var options = regexp.toString().substr(clean_regexp.length + 2);
  var options_array = [];
  // Extract all options that are legal and sort them alphabetically
  for(var index = 0; index < options.length; index++) {
    var chr = options.charAt(index);
    if(chr == 'i' || chr == 'm' || chr == 'x') options_array.push(chr);
  }
  // Don't need to sort the alphabetically as it's already done by javascript on creation of a Regexp obejct
  options = options_array.join('');
  // Encode the regular expression  
  return mongo.BinaryParser.encode_utf8(clean_regexp) + mongo.BinaryParser.fromByte(0) + mongo.BinaryParser.encode_utf8(options) + mongo.BinaryParser.fromByte(0);
}

exports.BSON.encodeBinary = function(binary) {
  var data = binary.value();
  return mongo.BinaryParser.fromByte(binary.sub_type) + mongo.BinaryParser.fromInt(data.length) + data;
}

exports.BSON.encodeDBRef = function(dbref) {
  var ordered_values = new mongo.OrderedHash();
  ordered_values.add('$ref', dbref.namespace);
  ordered_values.add('$id', dbref.oid);
  if(dbref.db != null) ordered_values.add('$db', dbref.db);
  return exports.BSON.encodeOrderedObject(ordered_values);
}

exports.BSON.checkKey = function(variable) {
  // Check if we have a legal key for the object
  if(variable.length > 0 && variable.substr(0, 1) == '$') {
    throw Error("key " + variable + " must not start with '$'");
  } else if(variable.length > 0 && variable.indexOf('.') != -1) {
    throw Error("key " + variable + " must not contain '.'");      
  }  
}

exports.BSON.encodeValue = function(encoded_string, variable, value, top_level, checkKeys) {
  var variable_encoded = variable == null ? '' : mongo.BinaryParser.encode_utf8(variable) + mongo.BinaryParser.fromByte(0);
  if(checkKeys && variable != null)exports.BSON.checkKey(variable);

  if(value == null) {
    encoded_string += mongo.BinaryParser.fromByte(exports.BSON.BSON_DATA_NULL) + variable_encoded;    
  } else if(value.constructor == String) {      
    encoded_string += mongo.BinaryParser.fromByte(exports.BSON.BSON_DATA_STRING) + variable_encoded + exports.BSON.encodeString(value);
  } else if(value.constructor == mongo.Long) {
    encoded_string += mongo.BinaryParser.fromByte(exports.BSON.BSON_DATA_LONG) + variable_encoded + exports.BSON.encodeLong(value);
  } else if(value.constructor == Number && value === parseInt(value,10)) {
    encoded_string += mongo.BinaryParser.fromByte(exports.BSON.BSON_DATA_INT) + variable_encoded + exports.BSON.encodeInt(mongo.Integer.fromInt(value));
  } else if(value.constructor == Number) {
    encoded_string += mongo.BinaryParser.fromByte(exports.BSON.BSON_DATA_NUMBER) + variable_encoded + exports.BSON.encodeFloat(value);
  } else if(value.constructor == Array) {
    var object_string = exports.BSON.encodeArray(value, checkKeys);
    encoded_string += mongo.BinaryParser.fromByte(exports.BSON.BSON_DATA_ARRAY) + variable_encoded + exports.BSON.encodeInt(mongo.Integer.fromInt(object_string.length + 4 + 1)) + object_string + mongo.BinaryParser.fromByte(0);
  } else if(value.constructor == Boolean) {
    encoded_string += mongo.BinaryParser.fromByte(exports.BSON.BSON_DATA_BOOLEAN) + variable_encoded + exports.BSON.encodeBoolean(value);
  } else if(value.constructor == Date) {
    encoded_string += mongo.BinaryParser.fromByte(exports.BSON.BSON_DATA_DATE) + variable_encoded + exports.BSON.encodeDate(value);
  } else if(value.constructor == RegExp) {
    encoded_string += mongo.BinaryParser.fromByte(exports.BSON.BSON_DATA_REGEXP) + variable_encoded + exports.BSON.encodeRegExp(value);
  } else if(value instanceof exports.ObjectID) {
    encoded_string += mongo.BinaryParser.fromByte(exports.BSON.BSON_DATA_OID) + variable_encoded + exports.BSON.encodeOid(value);
  } else if(value instanceof exports.Code) {
    encoded_string += mongo.BinaryParser.fromByte(exports.BSON.BSON_DATA_CODE_W_SCOPE) + variable_encoded + exports.BSON.encodeCode(value, checkKeys);
  } else if(value instanceof mongo.OrderedHash) {
    var object_string = exports.BSON.encodeOrderedObject(value, checkKeys);
    encoded_string += (!top_level ? mongo.BinaryParser.fromByte(exports.BSON.BSON_DATA_OBJECT) : '') + variable_encoded + exports.BSON.encodeInt(mongo.Integer.fromInt(object_string.length + 4 + 1)) + object_string + mongo.BinaryParser.fromByte(0);
  } else if(value instanceof exports.Binary) {
    var object_string = exports.BSON.encodeBinary(value);
    encoded_string += mongo.BinaryParser.fromByte(exports.BSON.BSON_DATA_BINARY) + variable_encoded + exports.BSON.encodeInt(mongo.Integer.fromInt(object_string.length - 1)) + object_string;
  } else if(value instanceof exports.DBRef) {
    var object_string = exports.BSON.encodeDBRef(value);
    encoded_string += mongo.BinaryParser.fromByte(exports.BSON.BSON_DATA_OBJECT) + variable_encoded + exports.BSON.encodeInt(mongo.Integer.fromInt(object_string.length + 4 + 1)) + object_string + mongo.BinaryParser.fromByte(0);
  } else if(value.constructor == Object) {
    var object_string = exports.BSON.encodeObject(value, checkKeys);
    encoded_string += (!top_level ? mongo.BinaryParser.fromByte(exports.BSON.BSON_DATA_OBJECT) : '') + variable_encoded + exports.BSON.encodeInt(mongo.Integer.fromInt(object_string.length + 4 + 1)) + object_string + mongo.BinaryParser.fromByte(0);
  } 
  
  return encoded_string;
}

exports.Code = Class({
  init: function(code, scope) {
    this.code = code;  
    this.scope = scope == null ? new mongo.OrderedHash() : scope;
  }
})

/**
  Object ID used to create object id's for the mongo requests
**/
exports.ObjectID = Class({
  init: function(id) { 
    id == null ? this.id = this.generate() : this.id = id;
  },
  
  get_inc: function() {
    exports.ObjectID.index = (exports.ObjectID.index + 1) % 0xFFFFFF;
    return exports.ObjectID.index;
  },
  
  generate: function() {
    var timeInteger = mongo.BinaryParser.fromInt(((new Date()).getTime()/1000));
    var memoryInteger = mongo.BinaryParser.encodeInt(((new Date()).getTime()/1000000) * Math.random(), 24, false);
    var pidInteger = mongo.BinaryParser.fromShort(process.pid);
    var indexInteger = mongo.BinaryParser.encodeInt(this.get_inc(), 24, false);
    return timeInteger + memoryInteger + pidInteger + indexInteger;
  },

  toHexString: function() {
    var hexString = '';
    for(var index = 0; index < this.id.length; index++) {
      var value = mongo.BinaryParser.toByte(this.id.substr(index, 1));
      var number = value <= 15 ? "0" + value.toString(16) : value.toString(16);
      hexString = hexString + number;
    }
    return hexString;
  },
  
  toString: function() {
    return this.id;
  }
})

exports.ObjectID.index = 0;
exports.ObjectID.createPk = function() {  
  return new exports.ObjectID();
}

/**
  DBRef contains a db reference
**/
exports.DBRef = Class({
  init: function(namespace, oid, db) {
    this.namespace = namespace;
    this.oid = oid;
    this.db = db;
  }
})

/**
  Contains the a binary stream of data
**/
exports.Binary = Class({
  init: function(value_array) {
    this.sub_type = exports.BSON.BSON_BINARY_SUBTYPE_BYTE_ARRAY;
    this.value_array = value_array == null ? new Array() : value_array;
  },

  put: function(byte_value) {
    this.value_array.push(mongo.BinaryParser.fromByte(byte_value.charCodeAt(0)));
  },
  
  write: function(string, offset) {
    if(offset < this.value_array.length) {
      if(offset + string.length > this.value_array.length) {
        var overwriteLength = this.value_array.length - offset;
        var leftOverLength = string.length - overwriteLength;
        // Overwrite bytes
        for(var i = 0; i < overwriteLength; i++) {
          this.value_array[offset + i] = mongo.BinaryParser.fromByte(string.charCodeAt(i));
        }
        // Push the rest
        for(var i = 0; i < leftOverLength; i++) {
          this.value_array.push(mongo.BinaryParser.fromByte(string.charCodeAt(this.value_array.length + i)));
        }
      } else {
        var overwriteLength = this.value_array.length - offset;
        var leftOverLength = string.length - overwriteLength;
        // Overwrite bytes
        for(var i = 0; i < overwriteLength; i++) {
          this.value_array[offset + i] = mongo.BinaryParser.fromByte(string.charCodeAt(i));
        }      
      }
    } else {
      for(var i = 0; i < string.length; i++) {
        this.value_array.push(mongo.BinaryParser.fromByte(string.charCodeAt(i)));
      }    
    }  
  },
  
  read: function(position, length) {
    var returnValue = [];
    for(var i = position; i < (position + length); i++) {
      returnValue.push(this.value_array[i]);
    }  
    return returnValue;
  },
  
  value: function() {
    return this.value_array.join('');
  },
  
  length: function() {
    return this.value_array.length;
  }
})