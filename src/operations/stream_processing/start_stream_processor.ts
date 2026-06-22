import { type Connection } from '../..';
import type { Document } from '../../bson';
import { MongoDBResponse } from '../../cmap/wire_protocol/responses';
import type { ClientSession } from '../../sessions';
import type { StartStreamProcessorOptions } from '../../stream_processing/types';
import { CommandOperation, type CommandOperationOptions } from '../command';
import { Aspect, defineAspects } from '../operation';

/** @internal */
export class StartStreamProcessorOperation extends CommandOperation<Document> {
  override SERVER_COMMAND_RESPONSE_TYPE = MongoDBResponse;

  constructor(
    readonly processorName: string,
    readonly aspOptions?: StartStreamProcessorOptions,
    options?: CommandOperationOptions
  ) {
    super(undefined, options);
  }

  override get commandName() {
    return 'startStreamProcessor' as const;
  }

  override buildCommandDocument(_connection: Connection, _session?: ClientSession): Document {
    const cmd: Document = { startStreamProcessor: this.processorName };

    if (this.aspOptions) {
      if (this.aspOptions.workers != null) cmd.workers = this.aspOptions.workers;

      const optsDoc: Document = {};
      if (this.aspOptions.clearCheckpoints != null)
        optsDoc.clearCheckpoints = this.aspOptions.clearCheckpoints;
      if (this.aspOptions.startAtOperationTime != null)
        optsDoc.startAtOperationTime = this.aspOptions.startAtOperationTime;
      if (this.aspOptions.startAfter != null) optsDoc.startAfter = this.aspOptions.startAfter;
      if (this.aspOptions.tier != null) optsDoc.tier = this.aspOptions.tier;
      if (this.aspOptions.enableAutoScaling != null)
        optsDoc.enableAutoScaling = this.aspOptions.enableAutoScaling;
      if (this.aspOptions.failover != null) optsDoc.failover = this.aspOptions.failover;
      if (Object.keys(optsDoc).length > 0) cmd.options = optsDoc;
    }

    return cmd;
  }
}

defineAspects(StartStreamProcessorOperation, [Aspect.WRITE_OPERATION]);
