import { type Connection } from '../..';
import type { Document } from '../../bson';
import { MongoDBResponse } from '../../cmap/wire_protocol/responses';
import type { ClientSession } from '../../sessions';
import type { GetStreamProcessorStatsOptions } from '../../stream_processing/types';
import { CommandOperation, type CommandOperationOptions } from '../command';
import { Aspect, defineAspects } from '../operation';

/** @internal */
export class GetStreamProcessorStatsOperation extends CommandOperation<Document> {
  override SERVER_COMMAND_RESPONSE_TYPE = MongoDBResponse;

  constructor(
    readonly processorName: string,
    readonly aspOptions?: GetStreamProcessorStatsOptions,
    options?: CommandOperationOptions
  ) {
    super(undefined, options);
  }

  override get commandName() {
    return 'getStreamProcessorStats' as const;
  }

  override buildCommandDocument(_connection: Connection, _session?: ClientSession): Document {
    const cmd: Document = { getStreamProcessorStats: this.processorName };

    if (this.aspOptions) {
      if (this.aspOptions.scale != null) cmd.scale = this.aspOptions.scale;
      if (this.aspOptions.verbose != null) cmd.verbose = this.aspOptions.verbose;
    }

    return cmd;
  }
}

defineAspects(GetStreamProcessorStatsOperation, [Aspect.READ_OPERATION, Aspect.RETRYABLE]);
