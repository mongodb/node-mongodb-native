/**
 * Sort functions, Normalize and prepare sort parameters
 */
var formatSortValue = exports.formatSortValue = function(sortDirection) {
  var value = ("" + sortDirection).toLowerCase();

  switch (value) {
    case 'ascending':
    case 'asc':
    case '1':
      return 1;
    case 'descending':
    case 'desc':
    case '-1':
      return -1;
    default:
      throw new Error("Illegal sort clause, must be of the form "
                    + "[['field1', '(ascending|descending)'], "
                    + "['field2', '(ascending|descending)']]");
  }
};

var formattedOrderClause = exports.formattedOrderClause = function(sortValue) {
  var orderBy = {};

  if (Array.isArray(sortValue)) {
    for(var i = 0; i < sortValue.length; i++) {
      if(sortValue[i].constructor == String) {
        orderBy[sortValue[i]] = 1;
      } else {
        orderBy[sortValue[i][0]] = formatSortValue(sortValue[i][1]);
      }      
    }
  } else if(Object.prototype.toString.call(sortValue) === '[object Object]') {
    orderBy = sortValue;
  } else if (sortValue.constructor == String) {
    orderBy[sortValue] = 1;
  } else {
    throw new Error("Illegal sort clause, must be of the form " +
      "[['field1', '(ascending|descending)'], ['field2', '(ascending|descending)']]");
  }

  return orderBy;
};

exports.encodeInt = function(value) {
  var buffer = new Buffer(4);
  buffer[3] = (value >> 24) & 0xff;      
  buffer[2] = (value >> 16) & 0xff;
  buffer[1] = (value >> 8) & 0xff;
  buffer[0] = value & 0xff;
  return buffer;
}

exports.encodeIntInPlace = function(value, buffer, index) {
  buffer[index + 3] = (value >> 24) & 0xff;			
	buffer[index + 2] = (value >> 16) & 0xff;
	buffer[index + 1] = (value >> 8) & 0xff;
	buffer[index] = value & 0xff;
}

exports.encodeCString = function(string) {
  var buf = new Buffer(string, 'utf8');
  return [buf, new Buffer([0])];
}

exports.decodeUInt32 = function(array, index) {
  return array[index] | array[index + 1] << 8 | array[index + 2] << 16 | array[index + 3] << 24;
}

// Decode the int
exports.decodeUInt8 = function(array, index) {
  return array[index];
}

/**
 * Context insensitive type checks
 */

var toString = Object.prototype.toString;

exports.isObject = function (arg) {
  return '[object Object]' == toString.call(arg)
}

exports.isArray = function (arg) {
  return Array.isArray(arg) ||
    'object' == typeof arg && '[object Array]' == toString.call(arg)
}

exports.isDate = function (arg) {
  return 'object' == typeof arg && '[object Date]' == toString.call(arg)
}

exports.isRegExp = function (arg) {
  return 'object' == typeof arg && '[object RegExp]' == toString.call(arg)
}

/**
 * Wrap a Mongo error document in an Error instance
 * @ignore
 * @api private
 */
exports.toError = function(error) {
  if (error instanceof Error) return error;

  var msg = error.err || error.errmsg || error;
  var e = new Error(msg);
  e.name = 'MongoError';

  // Get all object keys
  var keys = typeof error == 'object'
    ? Object.keys(error)
    : [];

  for(var i = 0; i < keys.length; i++) {
    e[keys[i]] = error[keys[i]];
  }

  return e;
}
