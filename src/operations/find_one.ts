import { type Db } from '..';
import { type Document, pluckBSONSerializeOptions } from '../bson';
import { type OnDemandDocumentDeserializeOptions } from '../cmap/wire_protocol/on_demand/document';
import { CursorResponse, ExplainResponse } from '../cmap/wire_protocol/responses';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { type TimeoutContext } from '../timeout';
import { MongoDBNamespace } from '../utils';
import { CommandOperation } from './command';
import { type FindOneOptions, makeFindCommand } from './find';
import { Aspect, defineAspects } from './operation';

/** @internal */
export class FindOneOperation<TSchema = any> extends CommandOperation<TSchema> {
  override options: FindOneOptions;
  /** @internal */
  private namespace: MongoDBNamespace;
  /** @internal */
  private filter: Document;
  /** @internal */
  protected deserializationOptions: OnDemandDocumentDeserializeOptions;

  constructor(db: Db, collectionName: string, filter: Document, options: FindOneOptions = {}) {
    super(db, options);
    this.namespace = new MongoDBNamespace(db.databaseName, collectionName);
    // special case passing in an ObjectId as a filter
    this.filter = filter != null && filter._bsontype === 'ObjectId' ? { _id: filter } : filter;
    this.options = { ...options };
    this.deserializationOptions = {
      ...pluckBSONSerializeOptions(options),
      validation: {
        utf8: options?.enableUtf8Validation === false ? false : true
      }
    };
  }

  override get commandName() {
    return 'find' as const;
  }

  override async execute(
    server: Server,
    session: ClientSession | undefined,
    timeoutContext: TimeoutContext
  ): Promise<TSchema> {
    const command: Document = makeFindCommand(this.namespace, this.filter, this.options);
    // Explicitly set the limit to 1 and singleBatch to true for all commands, per the spec.
    // noCursorTimeout must be unset as well as batchSize.
    // See: https://github.com/mongodb/specifications/blob/master/source/crud/crud.md#findone-api-details
    command.limit = 1;
    command.singleBatch = true;
    if (command.noCursorTimeout != null) {
      delete command.noCursorTimeout;
    }
    if (command.batchSize != null) {
      delete command.batchSize;
    }

    if (this.explain) {
      const response = await super.executeCommand(
        server,
        session,
        command,
        timeoutContext,
        ExplainResponse
      );
      return response.toObject() as TSchema;
    } else {
      const response = await super.executeCommand(
        server,
        session,
        command,
        timeoutContext,
        CursorResponse
      );
      return response.shift(this.deserializationOptions);
    }
  }
}

defineAspects(FindOneOperation, [Aspect.READ_OPERATION, Aspect.RETRYABLE, Aspect.EXPLAINABLE]);
