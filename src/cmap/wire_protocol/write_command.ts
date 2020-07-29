import { MongoError } from '../../error';
import { collectionNamespace } from '../../utils';
import command = require('./command');

function writeCommand(
  server: any,
  type: any,
  opsField: any,
  ns: any,
  ops: any,
  options: any,
  callback: Function
) {
  if (ops.length === 0) throw new MongoError(`${type} must contain at least one document`);
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  options = options || {};
  const ordered = typeof options.ordered === 'boolean' ? options.ordered : true;
  const writeConcern = options.writeConcern;
  const writeCommand: any = {} as any;
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

  if (writeConcern && writeConcern.w === 0) {
    // don't include session for unacknowledged writes
    if (options && options.session && options.session.explicit) {
      throw new MongoError('Cannot have explicit session with unacknowledged writes')
    }
    if (options) {
      delete options.session;
    }
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

export = writeCommand;
