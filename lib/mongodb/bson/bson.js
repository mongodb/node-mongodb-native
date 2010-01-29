// Alias a string function
var chr = String.fromCharCode;

BSON = function() {
}

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
BSON.BSON_BINARY_SUBTYPE_FUNCTION = 1;
BSON.BSON_BINARY_SUBTYPE_BYTE_ARRAY = 2;
BSON.BSON_BINARY_SUBTYPE_UUID = 3;
BSON.BSON_BINARY_SUBTYPE_MD5 = 4;
BSON.BSON_BINARY_SUBTYPE_USER_DEFINED = 128;

BSON.prototype = new Object();
BSON.prototype.serialize = function(data, checkKeys) {
  return this.encodeValue('', null, data, true, checkKeys == null ? false : checkKeys);
}

BSON.prototype.deserialize = function(data) {
  this.deserialize(data, false);
}
BSON.prototype.deserialize = function(data, is_array_item) {
  // The return data 
  var return_data = new OrderedHash();
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
    var insert_index = 0;
    
    // Adjust for the type of element
    index = index + 1;
    // If it's a string decode the value
    if(type == BSON.BSON_DATA_STRING) {
      
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
      var string_size = BinaryParser.toInt(data.substr(index, 4));
      // Adjust the index to point at start of string
      index = index + 4;
      // Read the string
      var value = data.substr(index, string_size - 1);
      // Adjust the index with the size of the string
      index = index + string_size;
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == BSON.BSON_DATA_NULL) {
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
    } else if(type == BSON.BSON_DATA_INT) {
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
      var value = BinaryParser.toInt(data.substr(index, 4));
      // Adjust the index with the size
      index = index + 4;
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == BSON.BSON_DATA_LONG) {
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
      var low_bits = Integer.fromInt(BinaryParser.toInt(data.substr(index, 4)));
      var high_bits = Integer.fromInt(BinaryParser.toInt(data.substr(index + 4, 4)));
      // Create to integers
      var value = new Long(low_bits, high_bits);
      // Adjust the index with the size
      index = index + 8;
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == BSON.BSON_DATA_NUMBER) {
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
      var value = BinaryParser.toDouble(data.substr(index, 8));
      // Adjust the index with the size
      index = index + 8;
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == BSON.BSON_DATA_OBJECT) {
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
      var object_size = BinaryParser.toInt(data.substr(index, 4));
      // Do a substr based on the size and parse the sub object
      var object_data = data.substr(index, object_size);
      // Parse the object
      var value = this.deserialize(object_data, false);
      // Adjust the index for the next value
      index = index + object_size;
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == BSON.BSON_DATA_ARRAY) {
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
      var array_size = BinaryParser.toInt(data.substr(index, 4));
      // Let's split off the data and parse all elements (keeping in mind the elements)
      var array_data = data.substr(index, array_size);
      // Parse the object
      var value = this.deserialize(array_data, true);
      // Adjust the index for the next value
      index = index + array_size;
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == BSON.BSON_DATA_BOOLEAN) {
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
      var boolean_value = BinaryParser.toSmall(data.substr(index, 1));
      var value = boolean_value == 1 ? true : false;
      // Adjust the index
      index = index + 1;
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == BSON.BSON_DATA_DATE) {
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
      var value_in_seconds = BinaryParser.toQWord(data.substr(index, 8));
      // Calculate date with miliseconds
      var value = new Date();
      value.setTime(value_in_seconds * 1000);
      // Adjust the index
      index = index + 8;
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == BSON.BSON_DATA_OID) {
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
      var value = new ObjectID(oid);
      // Adjust the index
      index = index + 12;
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == BSON.BSON_DATA_CODE_W_SCOPE) {
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
      var scope_object = this.deserialize(bson_object_string);
      // Create code object
      var value = new Code(code_string, scope_object);
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == BSON.BSON_DATA_REGEXP) {
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
      while(BinaryParser.toByte((chr = data.charAt(index++))) != 0) {
        reg_exp_array.push(chr);
      }
      // Read the options for the regular expression
      var options_array = [];
      while(BinaryParser.toByte((chr = data.charAt(index++))) != 0) {
        options_array.push(chr);
      }
      // Regular expression
      var value = new RegExp(reg_exp_array.join(''), options_array.join(''));
      // Set the data on the object
      is_array_item ? return_array[insert_index] = value : return_data.add(string_name, value);
    } else if(type == BSON.BSON_DATA_BINARY) {
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
      var total_number_of_bytes = BinaryParser.toInt(data.substr(index, 4));
      index = index + 4;
      // Decode the subtype
      var sub_type = BinaryParser.toByte(data.substr(index, 1));
      index = index + 1;
      // Binary object
      var value = new Binary();
      value.sub_type = sub_type;
      // Read the size of the binary
      var number_of_bytes = BinaryParser.toInt(data.substr(index, 4));
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
    return_data = new DBRef(return_data.get('$ref'), return_data.get('$id'), return_data.get('$db'));
  }
  
  // Return the data
  return is_array_item ? return_array : return_data;
}
  
BSON.prototype.encodeString = function(string) {
  // Calculate the string length
  var string_length = string.length + 1;
  // Encode the string as binary with the length
  return BinaryParser.fromInt(string_length) + BinaryParser.encode_utf8(string) + BinaryParser.fromByte(0);
}

BSON.prototype.encodeInt = function(number) {
  return BinaryParser.fromInt(number.toInt());
}

BSON.prototype.encodeLong = function(number) {
  return BinaryParser.fromInt(number.getLowBits()) + BinaryParser.fromInt(number.getHighBits());
}

BSON.prototype.encodeFloat = function(number) {
  return BinaryParser.fromDouble(number);
}

BSON.prototype.encodeArray = function(array, checkKeys) { 
  var encoded_string = '';
   
  for(var index = 0; index < array.length; index++) {
    var index_string = new String(index) + BinaryParser.fromByte(0);
    var encoded_object = this.encodeValue('', null, array[index], false, checkKeys);
    encoded_string += encoded_object.substr(0, 1) + index_string + encoded_object.substr(1);
  }
  
  return encoded_string;
}

BSON.prototype.encodeObject = function(object, checkKeys) {
  var encoded_string = '';
  // Keep track of the variable index
  var index = 0;
  // Let's fetch all the variables for the object and encode each
  for(var variable in object) {    
    encoded_string += this.encodeValue('', variable, object[variable], false, checkKeys);
    index = index + 1;
  }
  // Return the encoded string
  return encoded_string;
}

BSON.prototype.encodeOrderedObject = function(object, checkKeys) {  
  var encoded_string = '';
  // Ensure the id is always first object of ordered hash
  if(object.get('_id') != null) encoded_string += this.encodeValue('', '_id', object.get('_id'), false, checkKeys);
  // Encode all other objects in the order provided
  for(var index = 0; index < object.keys().length; index++) {
    var key = object.keys()[index];
    if(key != '_id') encoded_string += this.encodeValue('', key, object.get(key), false, checkKeys);
  }
  return encoded_string;
}

BSON.prototype.encodeBoolean = function(value) {
  return value ? BinaryParser.fromSmall(1) : BinaryParser.fromSmall(0);
}

BSON.prototype.encodeDate = function(value) {
  return BinaryParser.fromQWord(value.getTime() / 1000);
}

BSON.prototype.encodeOid = function(oid) {
  return oid.id;
}

BSON.prototype.encodeCode = function(code, checkKeys) {  
  // Get the code_string
  var code_string = this.encodeString(code.code);
  var scope = BinaryParser.fromInt(5) + BinaryParser.fromByte(0);
  // Encode the scope (a hash of values or ordered hash)
  if(code.scope != null) {
    scope = this.encodeValue('', null, code.scope, false, checkKeys);
    scope = scope.substring(1, scope.length);
  }
  // Calculate lengths
  var total_length = code_string.length - 4 + scope.length + 8;
  return BinaryParser.fromInt(total_length) + code_string + scope;
}

BSON.prototype.encodeRegExp = function(regexp) {  
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
  return BinaryParser.encode_utf8(clean_regexp) + BinaryParser.fromByte(0) + BinaryParser.encode_utf8(options) + BinaryParser.fromByte(0);
}

BSON.prototype.encodeBinary = function(binary) {
  var data = binary.value();
  return BinaryParser.fromByte(binary.sub_type) + BinaryParser.fromInt(data.length) + data;
}

BSON.prototype.encodeDBRef = function(dbref) {
  var ordered_values = new OrderedHash();
  ordered_values.add('$ref', dbref.namespace);
  ordered_values.add('$id', dbref.oid);
  if(dbref.db != null) ordered_values.add('$db', dbref.db);
  return this.encodeOrderedObject(ordered_values);
}

BSON.prototype.checkKey = function(variable) {
  // Check if we have a legal key for the object
  if(variable.length > 0 && variable.substr(0, 1) == '$') {
    throw Error("key " + variable + " must not start with '$'");
  } else if(variable.length > 0 && variable.indexOf('.') != -1) {
    throw Error("key " + variable + " must not contain '.'");      
  }  
}

BSON.prototype.encodeValue = function(encoded_string, variable, value, top_level, checkKeys) {
  var variable_encoded = variable == null ? '' : BinaryParser.encode_utf8(variable) + BinaryParser.fromByte(0);
  if(checkKeys && variable != null)this.checkKey(variable);
  
  if(value == null) {
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_NULL) + variable_encoded;    
  } else if(value.constructor == String) {      
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_STRING) + variable_encoded + this.encodeString(value);
  } else if(value.constructor == Long) {
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_LONG) + variable_encoded + this.encodeLong(value);
  } else if(value.constructor == Number && value === parseInt(value,10)) {
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_INT) + variable_encoded + this.encodeInt(Integer.fromInt(value));
  } else if(value.constructor == Number) {
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_NUMBER) + variable_encoded + this.encodeFloat(value);
  } else if(value.constructor == Array) {
    var object_string = this.encodeArray(value, checkKeys);
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_ARRAY) + variable_encoded + this.encodeInt(Integer.fromInt(object_string.length + 4 + 1)) + object_string + BinaryParser.fromByte(0);
  } else if(value.constructor == Boolean) {
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_BOOLEAN) + variable_encoded + this.encodeBoolean(value);
  } else if(value.constructor == Date) {
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_DATE) + variable_encoded + this.encodeDate(value);
  } else if(value.constructor == RegExp) {
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_REGEXP) + variable_encoded + this.encodeRegExp(value);
  } else if(value instanceof ObjectID) {
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_OID) + variable_encoded + this.encodeOid(value);
  } else if(value instanceof Code) {
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_CODE_W_SCOPE) + variable_encoded + this.encodeCode(value, checkKeys);
  } else if(value instanceof OrderedHash) {
    var object_string = this.encodeOrderedObject(value, checkKeys);
    encoded_string += (!top_level ? BinaryParser.fromByte(BSON.BSON_DATA_OBJECT) : '') + variable_encoded + this.encodeInt(Integer.fromInt(object_string.length + 4 + 1)) + object_string + BinaryParser.fromByte(0);
  } else if(value instanceof Binary) {
    var object_string = this.encodeBinary(value);
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_BINARY) + variable_encoded + this.encodeInt(Integer.fromInt(object_string.length - 1)) + object_string;
  } else if(value instanceof DBRef) {
    var object_string = this.encodeDBRef(value);
    encoded_string += BinaryParser.fromByte(BSON.BSON_DATA_OBJECT) + variable_encoded + this.encodeInt(Integer.fromInt(object_string.length + 4 + 1)) + object_string + BinaryParser.fromByte(0);
  } else if(value.constructor == Object) {
    var object_string = this.encodeObject(value, checkKeys);
    encoded_string += (!top_level ? BinaryParser.fromByte(BSON.BSON_DATA_OBJECT) : '') + variable_encoded + this.encodeInt(Integer.fromInt(object_string.length + 4 + 1)) + object_string + BinaryParser.fromByte(0);
  } 
  
  return encoded_string;
}

Code = function(code, scope) {
  this.code = code;  
  this.scope = scope == null ? new OrderedHash() : scope;
}

Code.prototype = new Object();

/**
  Object ID used to create object id's for the mongo requests
**/
ObjectID = function(id) { 
  id == null ? this.id = this.generate() : this.id = id;
}

ObjectID.prototype = new Object();
ObjectID.index = 0;
ObjectID.prototype.get_inc = function() {
  ObjectID.index = (ObjectID.index + 1) % 0xFFFFFF;
  return ObjectID.index;
}
ObjectID.prototype.generate = function() {
  var timeInteger = BinaryParser.fromInt(((new Date()).getTime()/1000));
  var memoryInteger = BinaryParser.encodeInt(((new Date()).getTime()/1000000) * Math.random(), 24, false);
  var pidInteger = BinaryParser.fromShort(process.pid);
  var indexInteger = BinaryParser.encodeInt(this.get_inc(), 24, false);
  return timeInteger + memoryInteger + pidInteger + indexInteger;
}
ObjectID.prototype.toHexString = function() {
  var hexString = '';
  for(var index = 0; index < this.id.length; index++) {
    var value = BinaryParser.toByte(this.id.substr(index, 1));
    var number = value <= 15 ? "0" + value.toString(16) : value.toString(16);
    hexString = hexString + number;
  }
  return hexString;
}
ObjectID.prototype.toString = function() {
  return this.id;
}

ObjectID.createPk = function() {  
  return new ObjectID();
}

/**
  RegexpOfHolding holdes the Mongo Regular Expressions
**/
RegexpOfHolding = function() {
  this.extra_options_str = '';
}

/**
  DBRef contains a db reference
**/
DBRef = function(namespace, oid, db) {
  this.namespace = namespace;
  this.oid = oid;
  this.db = db;
}

/**
  Contains the a binary stream of data
**/
Binary = function(value_array) {
  this.sub_type = BSON.BSON_BINARY_SUBTYPE_BYTE_ARRAY;
  this.value_array = value_array == null ? new Array() : value_array;
}

Binary.prototype = new Object();
Binary.prototype.put = function(byte_value) {
  this.value_array.push(BinaryParser.fromByte(byte_value.charCodeAt(0)));
}
Binary.prototype.write = function(string) {
  for(var i = 0; i < string.length; i++) {
    this.value_array.push(BinaryParser.fromByte(string.charCodeAt(i)));
  }
}
Binary.prototype.read = function(position, length) {
  var returnValue = [];
  for(var i = position; i < (position + length); i++) {
    returnValue.push(this.value_array[i]);
  }  
  return returnValue;
}
Binary.prototype.value = function() {
  return this.value_array.join('');
}

Binary.prototype.length = function() {
  return this.value_array.length;
}



