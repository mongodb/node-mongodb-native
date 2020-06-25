'use strict';
const writeCommand = require('./write_command');

module.exports = {
  insert: function insert(server, ns, ops, options, callback) {
    writeCommand(server, 'insert', 'documents', ns, ops, options, callback);
  },
  update: function update(server, ns, ops, options, callback) {
    writeCommand(server, 'update', 'updates', ns, ops, options, callback);
  },
  remove: function remove(server, ns, ops, options, callback) {
    writeCommand(server, 'delete', 'deletes', ns, ops, options, callback);
  },
  killCursors: require('./kill_cursors'),
  getMore: require('./get_more'),
  query: require('./query'),
  command: require('./command')
};
