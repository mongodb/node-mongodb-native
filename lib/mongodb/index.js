
try {
  exports.BSONPure = require('./bson/bson');
  exports.BSONNative = require('../../external-libs/bson');
} catch(err) {
  // do nothing
}

[ 'bson/binary_parser'
  , 'bson/binary'
  , 'bson/code'
  , 'bson/db_ref'
  , 'bson/double'
  , 'bson/max_key'
  , 'bson/min_key'
  , 'bson/objectid'
  , 'bson/symbol'
  , 'bson/timestamp'
  , 'goog/math/long'
  , 'commands/base_command'
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
  , 'goog/math/long'
  , 'gridfs/grid'
  ,	'gridfs/chunk'
  , 'gridfs/gridstore'].forEach(function (path) {
  	var module = require('./' + path);
  	for (var i in module) {
  		exports[i] = module[i];
    }
});

// Exports all the classes for the NATIVE JS BSON Parser
exports.native = function() {
  var classes = {};
  // Map all the classes
  [ 'bson/binary_parser'
    , '../../external-libs/bson/bson'
    , 'commands/base_command'
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
  // Return classes list
  return classes;
}

// Exports all the classes for the PURE JS BSON Parser
exports.pure = function() {
  var classes = {};
  // Map all the classes
  [ 'bson/binary_parser'
    , './bson/bson'
    , 'commands/base_command'
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
  // Return classes list
  return classes;
}
