import { type Connection } from '../..';
import type { Document } from '../../bson';
import { MongoDBResponse } from '../../cmap/wire_protocol/responses';
import type { ClientSession } from '../../sessions';
import { CommandOperation, type CommandOperationOptions } from '../command';
import { Aspect, defineAspects } from '../operation';

/** @internal */
export class GetMoreSampleStreamProcessorOperation extends CommandOperation<Document> {
  override SERVER_COMMAND_RESPONSE_TYPE = MongoDBResponse;

  constructor(
    readonly processorName: string,
    readonly cursorId: bigint | number,
    readonly batchSize?: number,
    options?: CommandOperationOptions
  ) {
    super(undefined, options);
  }

  override get commandName() {
    return 'getMoreSampleStreamProcessor' as const;
  }

  override buildCommandDocument(_connection: Connection, _session?: ClientSession): Document {
    const cmd: Document = {
      getMoreSampleStreamProcessor: this.processorName,
      cursorId: this.cursorId
    };
    if (this.batchSize != null) cmd.batchSize = this.batchSize;
    return cmd;
  }
}

defineAspects(GetMoreSampleStreamProcessorOperation, [Aspect.WRITE_OPERATION]);
