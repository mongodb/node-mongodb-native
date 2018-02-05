'use strict';

const executeWrite = require('./execute_write');
const executeFind = require('./execute_find');
const executeKillCursor = require('./execute_kill_cursor');
const executeGetMore = require('./execute_get_more');
const setupCommand = require('./setup_command');

const errors = require('../../error');
const MongoError = errors.MongoError;

class WireProtocol {
  constructor() {}

  insert(pool, ismaster, ns, bson, ops, options, callback) {
    executeWrite(pool, bson, 'insert', 'documents', ns, ops, options, callback);
  }

  update(pool, ismaster, ns, bson, ops, options, callback) {
    executeWrite(pool, bson, 'update', 'updates', ns, ops, options, callback);
  }

  remove(pool, ismaster, ns, bson, ops, options, callback) {
    executeWrite(pool, bson, 'delete', 'deletes', ns, ops, options, callback);
  }

  killCursor(bson, ns, cursorState, pool, callback) {
    executeKillCursor(bson, ns, cursorState, pool, callback);
  }

  getMore(bson, ns, cursorState, batchSize, raw, connection, options, callback) {
    executeGetMore(bson, ns, cursorState, batchSize, raw, connection, options, callback);
  }

  command(bson, ns, cmd, cursorState, topology, options) {
    options = options || {};
    // Check if this is a wire protocol command or not
    const wireProtocolCommand =
      typeof options.wireProtocolCommand === 'boolean' ? options.wireProtocolCommand : true;

    // Establish type of command
    if (cmd.find && wireProtocolCommand) {
      // Create the find command
      const query = executeFind(bson, ns, cmd, cursorState, topology, options);
      // Mark the cmd as virtual
      cmd.virtual = false;
      // Signal the documents are in the firstBatch value
      query.documentsReturnedIn = 'firstBatch';
      // Return the query
      return query;
    } else if (cursorState.cursorId != null) {
      return;
    } else if (cmd) {
      return setupCommand(bson, ns, cmd, cursorState, topology, options);
    }

    throw new MongoError(`command ${JSON.stringify(cmd)} does not return a cursor`);
  }
}

module.exports = WireProtocol;
