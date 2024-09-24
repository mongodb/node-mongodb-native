import type { Document } from '../bson';
import { type ClientBulkWriteCursorResponse } from '../cmap/wire_protocol/responses';
import { MongoBulkWriteCursorError } from '../error';
import type { MongoClient } from '../mongo_client';
import { ClientBulkWriteOperation } from '../operations/client_bulk_write/client_bulk_write';
import { type ClientBulkWriteOptions } from '../operations/client_bulk_write/common';
import { executeOperation } from '../operations/execute_operation';
import type { ClientSession } from '../sessions';
import { mergeOptions, MongoDBNamespace } from '../utils';
import {
  AbstractCursor,
  type AbstractCursorOptions,
  type InitialCursorResponse
} from './abstract_cursor';

/** @public */
export interface ClientBulkWriteCursorOptions
  extends AbstractCursorOptions,
    ClientBulkWriteOptions {}

/**
 * This is the cursor that handles client bulk write operations. Note this is never
 * exposed directly to the user and is always immediately exhausted.
 * @internal
 */
export class ClientBulkWriteCursor extends AbstractCursor {
  public readonly command: Document;
  /** @internal */
  private cursorResponse?: ClientBulkWriteCursorResponse;
  /** @internal */
  private clientBulkWriteOptions: ClientBulkWriteOptions;

  /** @internal */
  constructor(client: MongoClient, command: Document, options: ClientBulkWriteOptions = {}) {
    super(client, new MongoDBNamespace('admin', '$cmd'), options);

    this.command = command;
    this.clientBulkWriteOptions = options;
  }

  /**
   * We need a way to get the top level cursor response fields for
   * generating the bulk write result, so we expose this here.
   */
  get response(): ClientBulkWriteCursorResponse {
    if (this.cursorResponse) return this.cursorResponse;
    throw new MongoBulkWriteCursorError(
      'No client bulk write cursor response returned from the server.'
    );
  }

  clone(): ClientBulkWriteCursor {
    const clonedOptions = mergeOptions({}, this.clientBulkWriteOptions);
    delete clonedOptions.session;
    return new ClientBulkWriteCursor(this.client, this.command, {
      ...clonedOptions
    });
  }

  /** @internal */
  async _initialize(session: ClientSession): Promise<InitialCursorResponse> {
    const clientBulkWriteOperation = new ClientBulkWriteOperation(this.command, {
      ...this.clientBulkWriteOptions,
      ...this.cursorOptions,
      session
    });

    const response = await executeOperation(this.client, clientBulkWriteOperation);
    this.cursorResponse = response;

    return { server: clientBulkWriteOperation.server, session, response };
  }
}
