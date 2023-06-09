import { type Callback, MongoUnexpectedServerResponseError } from 'mongodb-legacy';

import type { Admin } from '../admin';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { CommandOperation, type CommandOperationOptions } from './command';

/** @public */
export interface ValidateCollectionOptions extends CommandOperationOptions {
  /** Validates a collection in the background, without interrupting read or write traffic (only in MongoDB 4.4+) */
  background?: boolean;
}

/** @internal */
export class ValidateCollectionOperation extends CommandOperation<Document> {
  override options: ValidateCollectionOptions;
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
    this.options = options;
    this.command = command;
    this.collectionName = collectionName;
  }

  override async execute(server: Server, session: ClientSession | undefined): Promise<Document> {
    const collectionName = this.collectionName;

    const doc = await super.executeCommand(server, session, this.command);
    // TODO(NODE-3483): Replace these with MongoUnexpectedServerResponseError
    if (doc.result != null && typeof doc.result !== 'string')
      throw new MongoUnexpectedServerResponseError('Error with validation data');
    if (doc.result != null && doc.result.match(/exception|corrupt/) != null)
      throw new MongoUnexpectedServerResponseError(`Invalid collection ${collectionName}`);
    if (doc.valid != null && !doc.valid)
      throw new MongoUnexpectedServerResponseError(`Invalid collection ${collectionName}`);

    return doc;
  }

  protected executeCallback(
    _server: Server,
    _session: ClientSession | undefined,
    _callback: Callback<Document>
  ): void {
    throw new Error('Method not implemented.');
  }
}
