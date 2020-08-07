import { defineAspects, Aspect } from './operation';
import { CommandOperation, CommandOperationOptions } from './command';
import type { Document, Callback } from '../types';
import type { Server } from '../sdam/server';
import type { Admin } from '../admin';

export interface ValidateCollectionOptions extends CommandOperationOptions {
  /** Validates a collection in the background, without interrupting read or write traffic (only in MongoDB 4.4+) */
  background: boolean;
}

export class ValidateCollectionOperation extends CommandOperation<ValidateCollectionOptions> {
  collectionName: string;
  command: Document;

  constructor(admin: Admin, collectionName: string, options: ValidateCollectionOptions) {
    // Decorate command with extra options
    const command: Document = { validate: collectionName };
    const keys = Object.keys(options);
    for (let i = 0; i < keys.length; i++) {
      if (Object.prototype.hasOwnProperty.call(options, keys[i]) && keys[i] !== 'session') {
        command[keys[i]] = (options as Document)[keys[i]];
      }
    }

    super(admin.s.db, options);
    this.command = command;
    this.collectionName = collectionName;
  }

  execute(server: Server, callback: Callback): void {
    const collectionName = this.collectionName;

    super.executeCommand(server, this.command, (err, doc) => {
      if (err != null) return callback(err, null);

      if (doc.ok === 0) return callback(new Error('Error with validate command'), null);
      if (doc.result != null && doc.result.constructor !== String)
        return callback(new Error('Error with validation data'), null);
      if (doc.result != null && doc.result.match(/exception|corrupt/) != null)
        return callback(new Error('Error: invalid collection ' + collectionName), null);
      if (doc.valid != null && !doc.valid)
        return callback(new Error('Error: invalid collection ' + collectionName), null);

      return callback(undefined, doc);
    });
  }
}

defineAspects(ValidateCollectionOperation, [Aspect.EXECUTE_WITH_SELECTION]);
