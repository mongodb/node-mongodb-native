import { Callback, maxWireVersion } from './../utils';
import { CommandOperation, CommandOperationOptions, OperationParent } from './command';
import { MongoError } from '../error';
import type { IndexSpecification } from './indexes';
import type { Server } from './../sdam/server';
import type { Document } from './../bson';

export interface HideIndexOptions extends CommandOperationOptions {
  keyPattern: IndexSpecification;
  hidden: boolean;
}

export class HideIndexOperation extends CommandOperation<HideIndexOptions, Document> {
  constructor(parent: OperationParent, options: HideIndexOptions) {
    console.log({ options });
    super(parent, options);
  }
  execute(server: Server, callback: Callback<Document>): void {
    const { hidden, keyPattern } = this.options;
    const hiding = hidden === true;
    const unhiding = hidden === false;
    if (hiding) {
      if (!(maxWireVersion(server) >= 9)) {
        return callback(new MongoError('The current server version does not support hiding index'));
      }
    }
    if (unhiding) {
      if (!(maxWireVersion(server) >= 8)) {
        return callback(
          new MongoError('The current server version does not support unhiding index')
        );
      }
    }
    const cmd = {
      collMod: this.collectionName,
      index: {
        keyPattern,
        hidden
      }
    };
    console.log(cmd);
    server.command(
      this.ns.toString(),
      cmd,
      { fullResult: !!this.fullResponse, ...this.options },
      callback
    );
  }
}
