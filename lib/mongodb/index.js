
try {
  // require('bson') = require('./bson/bson');
  // exports.BSONNative = require('../../external-libs/bson');
  require('bson') = require('bson').BSONPure;
  exports.BSONNative = require('bson').BSONNative;
} catch(err) {
  // do nothing
}

[ 'commands/base_command'
  , 'commands/db_command'
  , 'commands/delete_command'
  , 'commands/get_more_command'
  , 'commands/insert_command'
  , 'commands/kill_cursor_command'
  , 'commands/query_command'
  , 'commands/update_command'
  , 'responses/mongo_reply'
  , 'admin'
  , 'collection'
  , 'connection/connection'
  , 'connection/server'
  , 'connection/repl_set_servers'
  , 'cursor'
  , 'db'
  , 'gridfs/grid'
  ,	'gridfs/chunk'
  , 'gridfs/gridstore'].forEach(function (path) {
  	var module = require('./' + path);
  	for (var i in module) {
  		exports[i] = module[i];
    }
    
    // Add BSON Classes
    exports.Binary = require('bson').Binary;
    exports.Code = require('bson').Code;
    exports.DBRef = require('bson').DBRef;
    exports.Double = require('bson').Double;
    exports.Long = require('bson').Long;
    exports.MinKey = require('bson').MinKey;
    exports.MaxKey = require('bson').MaxKey;
    exports.ObjectID = require('bson').ObjectID;
    exports.Symbol = require('bson').Symbol;
    exports.Timestamp = require('bson').Timestamp;    
});

// // Exports all the classes for the NATIVE JS BSON Parser
// exports.native = function() {
//   var classes = {};
//   // Map all the classes
//   [ 'bson/binary_parser'
//     , 'bson/binary'
//     , 'bson/code'
//     , 'bson/db_ref'
//     , 'bson/double'
//     , 'bson/max_key'
//     , 'bson/min_key'
//     , 'bson/ObjectID'
//     , 'bson/symbol'
//     , 'bson/timestamp'
//     , 'bson/long'
//     , '../../external-libs/bson/bson'
//     , 'commands/base_command'
//     , 'commands/db_command'
//     , 'commands/delete_command'
//     , 'commands/get_more_command'
//     , 'commands/insert_command'
//     , 'commands/kill_cursor_command'
//     , 'commands/query_command'
//     , 'commands/update_command'
//     , 'responses/mongo_reply'
//     , 'admin'
//     , 'collection'
//     , 'connection/connection'
//     , 'connection/server'
//     , 'connection/repl_set_servers'
//     , 'cursor'
//     , 'db'
//     , 'gridfs/grid'
//     ,  'gridfs/chunk'
//     , 'gridfs/gridstore'].forEach(function (path) {
//      var module = require('./' + path);
//      for (var i in module) {
//        classes[i] = module[i];
//       }
//   });
//   // Return classes list
//   return classes;
// }
// 
// // Exports all the classes for the PURE JS BSON Parser
// exports.pure = function() {
//   var classes = {};
//   // Map all the classes
//   [ 'bson/binary_parser'
//     , 'bson/binary'
//     , 'bson/code'
//     , 'bson/db_ref'
//     , 'bson/double'
//     , 'bson/max_key'
//     , 'bson/min_key'
//     , 'bson/ObjectID'
//     , 'bson/symbol'
//     , 'bson/timestamp'
//     , 'bson/long'
//     , './bson/bson'
//     , 'commands/base_command'
//     , 'commands/db_command'
//     , 'commands/delete_command'
//     , 'commands/get_more_command'
//     , 'commands/insert_command'
//     , 'commands/kill_cursor_command'
//     , 'commands/query_command'
//     , 'commands/update_command'
//     , 'responses/mongo_reply'
//     , 'admin'
//     , 'collection'
//     , 'connection/connection'
//     , 'connection/server'
//     , 'connection/repl_set_servers'
//     , 'cursor'
//     , 'db'
//     , 'gridfs/grid'
//     ,  'gridfs/chunk'
//     , 'gridfs/gridstore'].forEach(function (path) {
//      var module = require('./' + path);
//      for (var i in module) {
//        classes[i] = module[i];
//       }
//   });
//   // Return classes list
//   return classes;
// }

// Exports all the classes for the PURE JS BSON Parser
exports.pure = function() {
  var classes = {};
  // Map all the classes
  [ 'commands/base_command'
    , 'commands/db_command'
    , 'commands/delete_command'
    , 'commands/get_more_command'
    , 'commands/insert_command'
    , 'commands/kill_cursor_command'
    , 'commands/query_command'
    , 'commands/update_command'
    , 'responses/mongo_reply'
    , 'admin'
    , 'collection'
    , 'connection/connection'
    , 'connection/server'
    , 'connection/repl_set_servers'
    , 'cursor'
    , 'db'
    , 'gridfs/grid'
    ,	'gridfs/chunk'
    , 'gridfs/gridstore'].forEach(function (path) {
    	var module = require('./' + path);
    	for (var i in module) {
    		classes[i] = module[i];
      }
  });

  // Add BSON Classes
  classes.Binary = require('bson').Binary;
  classes.Code = require('bson').Code;
  classes.DBRef = require('bson').DBRef;
  classes.Double = require('bson').Double;
  classes.Long = require('bson').Long;
  classes.MinKey = require('bson').MinKey;
  classes.MaxKey = require('bson').MaxKey;
  classes.ObjectID = require('bson').ObjectID;
  classes.Symbol = require('bson').Symbol;
  classes.Timestamp = require('bson').Timestamp;

  // Return classes list
  return classes;
}
