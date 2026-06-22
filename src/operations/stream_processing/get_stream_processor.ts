import { type Connection } from '../..';
import type { Document } from '../../bson';
import { MongoDBResponse } from '../../cmap/wire_protocol/responses';
import type { ClientSession } from '../../sessions';
import { CommandOperation, type CommandOperationOptions } from '../command';
import { Aspect, defineAspects } from '../operation';

/** @internal */
export class GetStreamProcessorOperation extends CommandOperation<Document> {
  override SERVER_COMMAND_RESPONSE_TYPE = MongoDBResponse;

  constructor(
    readonly processorName: string,
    options?: CommandOperationOptions
  ) {
    super(undefined, options);
  }

  override get commandName() {
    return 'getStreamProcessor' as const;
  }

  override buildCommandDocument(_connection: Connection, _session?: ClientSession): Document {
    return { getStreamProcessor: this.processorName };
  }
}

defineAspects(GetStreamProcessorOperation, [Aspect.READ_OPERATION, Aspect.RETRYABLE]);
