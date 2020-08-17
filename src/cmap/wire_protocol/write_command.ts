import { MongoError } from '../../error';
import { collectionNamespace, Callback } from '../../utils';
import { command, CommandOptions } from './command';
import type { Server } from '../../sdam/server';
import type { Document, BSONSerializeOptions } from '../../bson';
import type { WriteConcern } from '../../write_concern';

export interface CollationOptions {
  locale: string;
  caseLevel: boolean;
  caseFirst: string;
  strength: number;
  numericOrdering: boolean;
  alternate: string;
  maxVariable: string;
  backwards: boolean;
}

export interface WriteCommandOptions extends BSONSerializeOptions, CommandOptions {
  ordered?: boolean;
  writeConcern?: WriteConcern;
  collation?: CollationOptions;
  bypassDocumentValidation?: boolean;
}

export function writeCommand(
  server: Server,
  type: string,
  opsField: string,
  ns: string,
  ops: Document[],
  options: WriteCommandOptions,
  callback: Callback
): void {
  if (ops.length === 0) throw new MongoError(`${type} must contain at least one document`);
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  options = options || {};
  const ordered = typeof options.ordered === 'boolean' ? options.ordered : true;
  const writeConcern = options.writeConcern;
  const writeCommand: Document = {};
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
