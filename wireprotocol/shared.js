"use strict"

var ReadPreference = require('../topologies/read_preference'),
  MongoError = require('../error');

var MESSAGE_HEADER_SIZE = 16;

// OPCODE Numbers
// Defined at https://docs.mongodb.com/manual/reference/mongodb-wire-protocol/#request-opcodes
var opcodes = {
  OP_REPLY: 1,
  OP_UPDATE: 2001,
  OP_INSERT: 2002,
  OP_QUERY: 2004,
  OP_GETMORE: 2005,
  OP_DELETE: 2006,
  OP_KILL_CURSORS: 2007,
  OP_COMPRESSED: 2012
}

var getReadPreference = function(cmd, options) {
  // Default to command version of the readPreference
  var readPreference = cmd.readPreference || new ReadPreference('primary');
  // If we have an option readPreference override the command one
  if(options.readPreference) {
    readPreference = options.readPreference;
  }

  if(typeof readPreference == 'string') {
    readPreference = new ReadPreference(readPreference);
  }

  if(!(readPreference instanceof ReadPreference)) {
    throw new MongoError('readPreference must be a ReadPreference instance');
  }

  return readPreference;
}

module.exports = {
  getReadPreference: getReadPreference,
  MESSAGE_HEADER_SIZE: MESSAGE_HEADER_SIZE,
  opcodes: opcodes
}
