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
