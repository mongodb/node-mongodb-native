import { type Connection } from '../..';
import type { Document } from '../../bson';
import { MongoDBResponse } from '../../cmap/wire_protocol/responses';
import type { ClientSession } from '../../sessions';
import { CommandOperation, type CommandOperationOptions } from '../command';
import { Aspect, defineAspects } from '../operation';

/** @internal */
export class DropStreamProcessorOperation extends CommandOperation<Document> {
  override SERVER_COMMAND_RESPONSE_TYPE = MongoDBResponse;

  constructor(
    readonly processorName: string,
    options?: CommandOperationOptions
  ) {
    super(undefined, options);
  }

  override get commandName() {
    return 'dropStreamProcessor' as const;
  }

  override buildCommandDocument(_connection: Connection, _session?: ClientSession): Document {
    return { dropStreamProcessor: this.processorName };
  }
}

defineAspects(DropStreamProcessorOperation, [Aspect.WRITE_OPERATION]);
