var timers = require('timers');

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

var isObject = exports.isObject = function (arg) {
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
var toError = function(error) {
  if (error instanceof Error) return error;

  var msg = error.err || error.errmsg || error.errMessage || error;
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
exports.toError = toError;

/**
 * Convert a single level object to an array
 * @ignore
 * @api private
 */
exports.objectToArray = function(object) {
  var list = [];

  for(var name in object) {
    list.push(object[name])
  }

  return list;
}

/**
 * Handle single command document return
 * @ignore
 * @api private
 */
exports.handleSingleCommandResultReturn = function(override_value_true, override_value_false, callback) {
  return function(err, result, connection) {
    if(err && typeof callback == 'function') return callback(err, null);
    if(!result || !result.documents || result.documents.length == 0)
      if(typeof callback == 'function') return callback(toError("command failed to return results"), null)
    if(result && result.documents[0].ok == 1) {
      if(override_value_true) return callback(null, override_value_true)
      if(typeof callback == 'function') return callback(null, result.documents[0]);
    }

    // Return the error from the document
    if(typeof callback == 'function') return callback(toError(result.documents[0]), override_value_false);    
  }
}

/**
 * Return correct processor
 * @ignore
 * @api private
 */
exports.processor = function() {
  // Set processor, setImmediate if 0.10 otherwise nextTick
  process.maxTickDepth = Infinity;
  // Only use nextTick
  return process.nextTick;
}

/**
 * Allow setting the socketTimeoutMS on all connections
 * to work around issues such as secondaries blocking due to compaction
 *
 * @ignore
 * @api private
 */
exports.setSocketTimeoutProperty = function(self, options) {
  Object.defineProperty(self, "socketTimeoutMS", {
      enumerable: true
    , get: function () { return options.socketTimeoutMS; }
    , set: function (value) { 
      // Set the socket timeoutMS value
      options.socketTimeoutMS = value;

      // Get all the connections
      var connections = self.allRawConnections();
      for(var i = 0; i < connections.length; i++) {
        connections[i].socketTimeoutMS = value;
      }
    }
  });  
}

/**
 * Determine if the server supports write commands
 *
 * @ignore
 * @api private
 */
exports.hasWriteCommands = function(connection) {
  return connection != null && connection.serverCapabilities != null && connection.serverCapabilities.hasWriteCommands;
}

/**
 * Fetch server capabilities
 *
 * @ignore
 * @api private
 */
exports.serverCapabilities = function(connection) {
  return connection != null && connection.serverCapabilities != null && connection.serverCapabilities.hasWriteCommands;
}

/**
 * Create index name based on field spec
 *
 * @ignore
 * @api private
 */
exports.parseIndexOptions = function(fieldOrSpec) {
  var fieldHash = {};
  var indexes = [];
  var keys;

  // Get all the fields accordingly
  if('string' == typeof fieldOrSpec) {
    // 'type'
    indexes.push(fieldOrSpec + '_' + 1);
    fieldHash[fieldOrSpec] = 1;
  } else if(Array.isArray(fieldOrSpec)) {
    fieldOrSpec.forEach(function(f) {
      if('string' == typeof f) {
        // [{location:'2d'}, 'type']
        indexes.push(f + '_' + 1);
        fieldHash[f] = 1;
      } else if(Array.isArray(f)) {
        // [['location', '2d'],['type', 1]]
        indexes.push(f[0] + '_' + (f[1] || 1));
        fieldHash[f[0]] = f[1] || 1;
      } else if(isObject(f)) {
        // [{location:'2d'}, {type:1}]
        keys = Object.keys(f);
        keys.forEach(function(k) {
          indexes.push(k + '_' + f[k]);
          fieldHash[k] = f[k];
        });
      } else {
        // undefined (ignore)
      }
    });
  } else if(isObject(fieldOrSpec)) {
    // {location:'2d', type:1}
    keys = Object.keys(fieldOrSpec);
    keys.forEach(function(key) {
      indexes.push(key + '_' + fieldOrSpec[key]);
      fieldHash[key] = fieldOrSpec[key];
    });
  }

  return {
    name: indexes.join("_"), keys: keys, fieldHash: fieldHash
  }
}
