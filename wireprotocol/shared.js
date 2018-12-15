'use strict';

var ReadPreference = require('../topologies/read_preference'),
  MongoError = require('../error').MongoError;

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
};

var getReadPreference = function(cmd, options) {
  // Default to command version of the readPreference
  var readPreference = cmd.readPreference || new ReadPreference('primary');
  // If we have an option readPreference override the command one
  if (options.readPreference) {
    readPreference = options.readPreference;
  }

  if (typeof readPreference === 'string') {
    readPreference = new ReadPreference(readPreference);
  }

  if (!(readPreference instanceof ReadPreference)) {
    throw new MongoError('read preference must be a ReadPreference instance');
  }

  return readPreference;
};

// Parses the header of a wire protocol message
var parseHeader = function(message) {
  return {
    length: message.readInt32LE(0),
    requestId: message.readInt32LE(4),
    responseTo: message.readInt32LE(8),
    opCode: message.readInt32LE(12)
  };
};

function applyCommonQueryOptions(queryOptions, options) {
  Object.assign(queryOptions, {
    raw: typeof options.raw === 'boolean' ? options.raw : false,
    promoteLongs: typeof options.promoteLongs === 'boolean' ? options.promoteLongs : true,
    promoteValues: typeof options.promoteValues === 'boolean' ? options.promoteValues : true,
    promoteBuffers: typeof options.promoteBuffers === 'boolean' ? options.promoteBuffers : false,
    monitoring: typeof options.monitoring === 'boolean' ? options.monitoring : false,
    fullResult: typeof options.fullResult === 'boolean' ? options.fullResult : false
  });

  if (typeof options.socketTimeout === 'number') {
    queryOptions.socketTimeout = options.socketTimeout;
  }

  if (options.session) {
    queryOptions.session = options.session;
  }

  if (typeof options.documentsReturnedIn === 'string') {
    queryOptions.documentsReturnedIn = options.documentsReturnedIn;
  }

  return queryOptions;
}

function isMongos(server) {
  if (server.type === 'mongos') return true;
  if (server.parent && server.parent.type === 'mongos') return true;
  // NOTE: handle unified topology
  return false;
}

function databaseNamespace(ns) {
  return ns.split('.')[0];
}
function collectionNamespace(ns) {
  return ns
    .split('.')
    .slice(1)
    .join('.');
}

module.exports = {
  getReadPreference,
  MESSAGE_HEADER_SIZE,
  opcodes,
  parseHeader,
  applyCommonQueryOptions,
  isMongos,
  databaseNamespace,
  collectionNamespace
};
