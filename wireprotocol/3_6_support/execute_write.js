'use strict';

const Msg = require('../../connection/msg').Msg;
const errors = require('../../error');
const MongoError = errors.MongoError;

function executeWrite(pool, bson, type, opsField, ns, ops, options, callback) {
  if (!(Array.isArray(ops) && ops.length)) {
    throw new MongoError('write operation must contain at least one document');
  }

  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  options = options || {};

  // Split the ns up to get db and collection
  const p = ns.split('.');
  const $db = p.shift();
  // Options
  const ordered = typeof options.ordered === 'boolean' ? options.ordered : true;
  const writeConcern = options.writeConcern;

  // return skeleton
  const writeCommand = { $db, ordered };
  writeCommand[type] = p.join('.');
  writeCommand[opsField] = ops;

  // Did we specify a write concern
  if (writeConcern && Object.keys(writeConcern).length > 0) {
    writeCommand.writeConcern = writeConcern;
  }

  // If we have collation passed in
  if (options.collation) {
    for (let i = 0; i < writeCommand[opsField].length; i++) {
      if (!writeCommand[opsField][i].collation) {
        writeCommand[opsField][i].collation = options.collation;
      }
    }
  }

  // Do we have bypassDocumentValidation set, then enable it on the write command
  if (typeof options.bypassDocumentValidation === 'boolean') {
    writeCommand.bypassDocumentValidation = options.bypassDocumentValidation;
  }

  // optionally add a `txnNumber` if retryable writes are being attempted
  if (typeof options.txnNumber !== 'undefined') {
    writeCommand.txnNumber = options.txnNumber;
  }

  // Options object
  const opts = { command: true };
  if (typeof options.session !== 'undefined') opts.session = options.session;
  var queryOptions = { checkKeys: false };
  if (type === 'insert') queryOptions.checkKeys = false;
  if (typeof options.checkKeys === 'boolean') queryOptions.checkKeys = options.checkKeys;

  // Ensure we support serialization of functions
  if (options.serializeFunctions) queryOptions.serializeFunctions = options.serializeFunctions;
  // Do not serialize the undefined fields
  if (options.ignoreUndefined) queryOptions.ignoreUndefined = options.ignoreUndefined;

  try {
    // Create write command
    const cmd = new Msg(bson, writeCommand, queryOptions);
    // Execute command
    pool.write(cmd, opts, callback);
  } catch (err) {
    callback(err);
  }
}

module.exports = executeWrite;
