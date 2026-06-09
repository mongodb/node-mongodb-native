import { type Connection } from '../..';
import type { Document } from '../../bson';
import { MongoDBResponse } from '../../cmap/wire_protocol/responses';
import type { ClientSession } from '../../sessions';
import type { CreateStreamProcessorOptions } from '../../stream_processing/types';
import { CommandOperation, type CommandOperationOptions } from '../command';
import { Aspect, defineAspects } from '../operation';

/** @internal */
export class CreateStreamProcessorOperation extends CommandOperation<Document> {
  override SERVER_COMMAND_RESPONSE_TYPE = MongoDBResponse;

  constructor(
    readonly processorName: string,
    readonly pipeline: Document[],
    readonly aspOptions?: CreateStreamProcessorOptions,
    options?: CommandOperationOptions
  ) {
    super(undefined, options);
  }

  override get commandName() {
    return 'createStreamProcessor' as const;
  }

  override buildCommandDocument(_connection: Connection, _session?: ClientSession): Document {
    const cmd: Document = {
      createStreamProcessor: this.processorName,
      pipeline: this.pipeline
    };

    if (this.aspOptions) {
      const optsDoc: Document = {};
      if (this.aspOptions.dlq != null) optsDoc.dlq = this.aspOptions.dlq;
      if (this.aspOptions.streamMetaFieldName != null)
        optsDoc.streamMetaFieldName = this.aspOptions.streamMetaFieldName;
      if (this.aspOptions.tier != null) optsDoc.tier = this.aspOptions.tier;
      if (this.aspOptions.failover != null) optsDoc.failover = this.aspOptions.failover;
      if (Object.keys(optsDoc).length > 0) cmd.options = optsDoc;
    }

    return cmd;
  }
}

defineAspects(CreateStreamProcessorOperation, [Aspect.WRITE_OPERATION]);
