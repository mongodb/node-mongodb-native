const insert = function insert(server: any, ns: any, ops: any, options: any, callback: Function) {
  writeCommand(server, 'insert', 'documents', ns, ops, options, callback);
};

const update = function update(server: any, ns: any, ops: any, options: any, callback: Function) {
  writeCommand(server, 'update', 'updates', ns, ops, options, callback);
};

const remove = function remove(server: any, ns: any, ops: any, options: any, callback: Function) {
  writeCommand(server, 'delete', 'deletes', ns, ops, options, callback);
};

import killCursors = require('./kill_cursors');
import getMore = require('./get_more');
import query = require('./query');
import command = require('./command');
import writeCommand = require('./write_command');

export { insert, update, remove, killCursors, getMore, query, command };
