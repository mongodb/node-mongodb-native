import { MongoError } from '../../error';
import { collectionNamespace } from '../../utils';
import { command } from './command';

import type { WriteConcern } from '../../write_concern';
import type { Server } from '../../sdam/server';
import type { Callback, Document } from '../../types';
import type { CommandOptions } from '../types';

export function writeCommand(
  server: Server,
  type: string,
  opsField: any,
  ns: string,
  ops: Document[],
  options: CommandOptions,
  callback: Callback
) {
  if (ops.length === 0) throw new MongoError(`${type} must contain at least one document`);
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  options = options || {};
  const ordered = typeof options.ordered === 'boolean' ? options.ordered : true;
  const writeConcern = options.writeConcern as WriteConcern;
  const writeCommand: any = {};
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
