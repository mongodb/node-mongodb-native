var bson = require('./bson');
exports.BSON = bson.BSON;
exports.Long = require('../../lib/mongodb/goog/math/long').Long;
exports.ObjectID = require('../../lib/mongodb/bson/objectid').ObjectID;
exports.DBRef = require('../../lib/mongodb/bson/db_ref').DBRef;
exports.Code = require('../../lib/mongodb/bson/code').Code;
exports.Timestamp = require('../../lib/mongodb/bson/timestamp').Timestamp;
exports.Binary = require('../../lib/mongodb/bson/binary').Binary;
exports.Double = require('../../lib/mongodb/bson/double').Double;
exports.MaxKey = require('../../lib/mongodb/bson/max_key').MaxKey;
exports.MinKey = require('../../lib/mongodb/bson/min_key').MinKey;
exports.Symbol = require('../../lib/mongodb/bson/symbol').Symbol;

// Just add constants tot he Native BSON parser
exports.BSON.BSON_BINARY_SUBTYPE_DEFAULT = 0;
exports.BSON.BSON_BINARY_SUBTYPE_FUNCTION = 1;
exports.BSON.BSON_BINARY_SUBTYPE_BYTE_ARRAY = 2;
exports.BSON.BSON_BINARY_SUBTYPE_UUID = 3;
exports.BSON.BSON_BINARY_SUBTYPE_MD5 = 4;
exports.BSON.BSON_BINARY_SUBTYPE_USER_DEFINED = 128;          
