/*
 * MongoDB OPCODES
 * reference: https://www.mongodb.com/docs/manual/reference/mongodb-wire-protocol/#request-opcodes
 */
const opcodes = {
  OP_REPLY: 1,
  OP_UPDATE: 2001,
  OP_INSERT: 2002,
  OP_QUERY: 2004,
  OP_GETMORE: 2005,
  OP_DELETE: 2006,
  OP_KILL_CURSORS: 2007,
  OP_COMPRESSED: 2012,
  OP_MSG: 2013
};

const compressorIDs = {
  snappy: 1,
  zlib: 2
};

const MESSAGE_HEADER_SIZE = 16;

module.exports = {
  opcodes: opcodes,
  compressorIDs: compressorIDs,
  MESSAGE_HEADER_SIZE: MESSAGE_HEADER_SIZE
};
