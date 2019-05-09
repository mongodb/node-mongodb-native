'use strict';

const MongoError = require('../error').MongoError;
const collectionNamespace = require('./shared').collectionNamespace;
const command = require('./command');

function writeCommand(server, type, opsField, ns, ops, options, callback) {
  if (ops.length === 0) throw new MongoError(`${type} must contain at least one document`);
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  options = options || {};
  const ordered = typeof options.ordered === 'boolean' ? options.ordered : true;
  const writeConcern = options.writeConcern;

  const writeCommand = {};
  writeCommand[type] = collectionNamespace(ns);
  writeCommand[opsField] = ops;
  writeCommand.ordered = ordered;

  if (writeConcern && Object.keys(writeConcern).length > 0) {
    writeCommand.writeConcern = writeConcern;
  }

  if (options.collation) {
    for (let i = 0; i < writeCommand[opsField].length; i++) {
      if (!writeCommand[opsField][i].collation) {
        writeCommand[opsField][i].collation = options.collation;
      }
    }
  }

  if (options.bypassDocumentValidation === true) {
    writeCommand.bypassDocumentValidation = options.bypassDocumentValidation;
  }

  const commandOptions = Object.assign(
    {
      checkKeys: type === 'insert',
      numberToReturn: 1
    },
    options
  );

  command(server, ns, writeCommand, commandOptions, callback);
}

module.exports = writeCommand;
