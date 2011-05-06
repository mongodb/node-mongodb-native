
try {
  exports.BSONPure = require('./bson/bson');
  exports.BSONNative = require('../../external-libs/bson/bson');
} catch(err) {
  // do nothing
}

[ 'bson/binary_parser'
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
, 'connections/server'
, 'connections/server_pair'
, 'connections/server_cluster'
, 'connections/repl_set_servers'
, 'connection'
, 'cursor'
, 'db'
, 'goog/math/integer'
, 'goog/math/long'
, 'crypto/md5'
,	'gridfs/chunk'
, 'gridfs/gridstore'].forEach(function (path) {
	var module = require('./' + path);
	for (var i in module) {
		exports[i] = module[i];
  }
});
