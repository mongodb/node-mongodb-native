import type { Document } from '../bson';
import type { Collection } from '../collection';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import type { Callback } from '../utils';
import { CommandOperation, type CommandOperationOptions } from './command';
import { Aspect, defineAspects } from './operation';

/** @public */
export interface EstimatedDocumentCountOptions extends CommandOperationOptions {
  /**
   * The maximum amount of time to allow the operation to run.
   *
   * This option is sent only if the caller explicitly provides a value. The default is to not send a value.
   */
  maxTimeMS?: number;
}

/** @internal */
export class EstimatedDocumentCountOperation extends CommandOperation<number> {
  override options: EstimatedDocumentCountOptions;
  collectionName: string;

  constructor(collection: Collection, options: EstimatedDocumentCountOptions = {}) {
    super(collection, options);
    this.options = options;
    this.collectionName = collection.collectionName;
  }

  override executeCallback(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<number>
  ): void {
    const cmd: Document = { count: this.collectionName };

    if (typeof this.options.maxTimeMS === 'number') {
      cmd.maxTimeMS = this.options.maxTimeMS;
    }

    // we check for undefined specifically here to allow falsy values
    // eslint-disable-next-line no-restricted-syntax
    if (this.options.comment !== undefined) {
      cmd.comment = this.options.comment;
    }

    super.executeCommand(server, session, cmd, (err, response) => {
      if (err) {
        callback(err);
        return;
      }

      callback(undefined, response?.n || 0);
    });
  }
}

defineAspects(EstimatedDocumentCountOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.CURSOR_CREATING
]);
