import type { Document } from '../bson';
import { MongoInvalidArgumentError } from '../error';
import { executeOperation } from '../operations/execute_operation';
import { CreateStreamProcessorOperation } from '../operations/stream_processing/create_stream_processor';
import { DropStreamProcessorOperation } from '../operations/stream_processing/drop_stream_processor';
import { GetMoreSampleStreamProcessorOperation } from '../operations/stream_processing/get_more_sample_stream_processor';
import { GetStreamProcessorOperation } from '../operations/stream_processing/get_stream_processor';
import { GetStreamProcessorStatsOperation } from '../operations/stream_processing/get_stream_processor_stats';
import { StartSampleStreamProcessorOperation } from '../operations/stream_processing/start_sample_stream_processor';
import { StartStreamProcessorOperation } from '../operations/stream_processing/start_stream_processor';
import { StopStreamProcessorOperation } from '../operations/stream_processing/stop_stream_processor';
import { SampleCursor } from './sample_cursor';
import type { StreamProcessingClient } from './stream_processing_client';
import type {
  CreateStreamProcessorOptions,
  GetStreamProcessorSamplesOptions,
  GetStreamProcessorSamplesResult,
  GetStreamProcessorStatsOptions,
  StartStreamProcessorOptions,
  StreamProcessorInfo
} from './types';

// NOTE: Per the ASP driver spec, server errors MUST be surfaced as-is.
// Do NOT introduce error-code branching, rewrapping, or filtering anywhere
// in this module. Known codes are documented in src/stream_processing/index.ts
// for reference only — they are not runtime invariants.

const VALID_TIERS = new Set(['SP2', 'SP5', 'SP10', 'SP30', 'SP50']);

function assertName(name: string): void {
  if (!name?.trim()) {
    throw new MongoInvalidArgumentError('Stream processor name must be a non-empty string');
  }
}

function toStreamProcessorInfo(doc: Document): StreamProcessorInfo {
  return {
    id: doc.id,
    name: doc.name,
    state: doc.state,
    pipeline: doc.pipeline ?? [],
    pipelineVersion: doc.pipelineVersion,
    tier: doc.tier,
    dlq: doc.dlq,
    streamMetaFieldName: doc.streamMetaFieldName,
    enableAutoScaling: doc.enableAutoScaling,
    failoverEnabled: doc.failoverEnabled,
    activeRegion: doc.activeRegion,
    lastModifiedAt: doc.lastModifiedAt,
    modifiedBy: doc.modifiedBy,
    lastStateChange: doc.lastStateChange,
    lastHeartbeat: doc.lastHeartbeat,
    hasStarted: doc.hasStarted,
    stats: doc.stats,
    errorMsg: doc.errorMsg,
    errorCode: doc.errorCode,
    errorRetryable: doc.errorRetryable,
    raw: doc
  };
}

/**
 * Provides collection-level operations for stream processors in an ASP workspace.
 * Obtained via {@link StreamProcessingClient.streamProcessors}.
 *
 * @public
 * @experimental
 */
export class StreamProcessors {
  constructor(private readonly client: StreamProcessingClient) {}

  /**
   * Creates a new stream processor in the workspace.
   *
   * Sends the `createStreamProcessor` wire command.
   * @remarks This operation is not retryable.
   *
   * @param name - Processor name; must be non-empty.
   * @param pipeline - Aggregation pipeline; must be non-empty.
   * @param options - Additional creation options.
   * @experimental
   */
  async create(
    name: string,
    pipeline: Document[],
    options?: CreateStreamProcessorOptions
  ): Promise<void> {
    assertName(name);
    if (!pipeline || pipeline.length === 0) {
      throw new MongoInvalidArgumentError('createStreamProcessor requires a non-empty pipeline');
    }
    const op = new CreateStreamProcessorOperation(name, pipeline, options);
    await executeOperation(this.client._mongoClient, op);
  }

  /**
   * Returns a `StreamProcessor` handle for an existing processor.
   * No wire command is sent.
   *
   * @param name - Processor name; must be non-empty.
   * @returns A `StreamProcessor` bound to the named processor.
   * @experimental
   */
  get(name: string): StreamProcessor {
    assertName(name);
    return new StreamProcessor(this.client, name);
  }

  /**
   * Retrieves the current state snapshot for a stream processor.
   *
   * Sends the `getStreamProcessor` wire command.
   * @remarks This operation is a retryable read.
   *
   * @param name - Processor name; must be non-empty.
   * @returns A `StreamProcessorInfo` snapshot with the full server response on `.raw`.
   * @experimental
   */
  async getInfo(name: string): Promise<StreamProcessorInfo> {
    assertName(name);
    const op = new GetStreamProcessorOperation(name);
    const response = await executeOperation(this.client._mongoClient, op);
    // Dev server wraps response in { ok, result }; Atlas returns flat.
    const doc = (response.result as Document | undefined) ?? response;
    return toStreamProcessorInfo(doc);
  }
}

/**
 * Represents a single stream processor and exposes its lifecycle operations.
 * Obtained via {@link StreamProcessors.get}.
 *
 * @public
 * @experimental
 */
export class StreamProcessor {
  constructor(
    private readonly client: StreamProcessingClient,
    /** The name of the stream processor. */
    public readonly name: string
  ) {
    assertName(name);
  }

  /**
   * Starts the stream processor.
   *
   * Sends the `startStreamProcessor` wire command.
   * @remarks This operation is not retryable.
   *
   * @param options - Start options. `startAfter` and `startAtOperationTime` are mutually exclusive.
   * @experimental
   */
  async start(options?: StartStreamProcessorOptions): Promise<void> {
    if (options?.startAfter && options?.startAtOperationTime) {
      throw new MongoInvalidArgumentError(
        'startAfter and startAtOperationTime are mutually exclusive'
      );
    }
    if (options?.tier != null && !VALID_TIERS.has(options.tier)) {
      throw new MongoInvalidArgumentError(`Invalid tier: ${options.tier}`);
    }
    if (options?.workers != null && options.workers <= 0) {
      throw new MongoInvalidArgumentError('workers must be a positive integer');
    }
    const op = new StartStreamProcessorOperation(this.name, options);
    await executeOperation(this.client._mongoClient, op);
  }

  /**
   * Stops the stream processor.
   *
   * Sends the `stopStreamProcessor` wire command.
   * @remarks This operation is not retryable.
   *
   * @experimental
   */
  async stop(): Promise<void> {
    const op = new StopStreamProcessorOperation(this.name);
    await executeOperation(this.client._mongoClient, op);
  }

  /**
   * Permanently deletes the stream processor.
   *
   * Sends the `dropStreamProcessor` wire command.
   * @remarks This operation is not retryable.
   *
   * @experimental
   */
  async drop(): Promise<void> {
    const op = new DropStreamProcessorOperation(this.name);
    await executeOperation(this.client._mongoClient, op);
  }

  /**
   * Returns statistics for the stream processor.
   *
   * Sends the `getStreamProcessorStats` wire command.
   * @remarks This operation is a retryable read.
   *
   * @param options - Stats options including optional scale factor.
   * @returns Raw stats document from the server.
   * @experimental
   */
  async stats(options?: GetStreamProcessorStatsOptions): Promise<Document> {
    if (options?.scale != null && options.scale <= 0) {
      throw new MongoInvalidArgumentError('scale must be a positive integer');
    }
    const op = new GetStreamProcessorStatsOperation(this.name, options);
    return await executeOperation(this.client._mongoClient, op);
  }

  /**
   * Spec-literal entry point for the two-phase sample protocol.
   *
   * When `options.cursorId` is absent, sends `startSampleStreamProcessor` (initial call).
   * When `options.cursorId` is present and non-zero, sends `getMoreSampleStreamProcessor`.
   * @remarks This operation is not retryable.
   *
   * @param options - Sample options; use `cursorId` to continue an existing cursor.
   * @returns `cursorId` and a batch of documents. `cursorId === 0` means exhausted.
   * @experimental
   */
  async getStreamProcessorSamples(
    options?: GetStreamProcessorSamplesOptions
  ): Promise<GetStreamProcessorSamplesResult> {
    const opts = options ?? {};

    if (opts.cursorId != null && Number(opts.cursorId) === 0) {
      throw new MongoInvalidArgumentError(
        'Sample cursor is exhausted; cursorId 0 cannot be continued'
      );
    }
    if (opts.cursorId != null && Number(opts.cursorId) < 0) {
      throw new MongoInvalidArgumentError('cursorId must be a non-negative value');
    }
    if (opts.limit != null && opts.limit < 0) {
      throw new MongoInvalidArgumentError('limit must be a non-negative integer');
    }
    if (opts.batchSize != null && opts.batchSize < 0) {
      throw new MongoInvalidArgumentError('batchSize must be a non-negative integer');
    }

    let response: Document;
    let documents: Document[];

    if (opts.cursorId == null) {
      // Initial: startSampleStreamProcessor with limit (NO batchSize)
      response = await executeOperation(
        this.client._mongoClient,
        new StartSampleStreamProcessorOperation(this.name, opts.limit)
      );
      // Real server returns `messages`; spec says `firstBatch`. Tolerate both.
      documents = (response.messages as Document[] | undefined) ?? response.firstBatch ?? [];
    } else {
      // Continuation: getMoreSampleStreamProcessor with batchSize (NO limit)
      response = await executeOperation(
        this.client._mongoClient,
        new GetMoreSampleStreamProcessorOperation(this.name, opts.cursorId, opts.batchSize)
      );
      // Real server returns `messages`; spec says `nextBatch`. Tolerate both.
      documents = (response.messages as Document[] | undefined) ?? response.nextBatch ?? [];
    }

    const cursorIdRaw = response.cursorId ?? 0;
    const cursorId = typeof cursorIdRaw === 'bigint' ? cursorIdRaw : Number(cursorIdRaw);
    return { cursorId, documents };
  }

  /**
   * Returns a `SampleCursor` that asynchronously iterates over stream processor output.
   *
   * @param options - Optional `limit` (initial call) and `batchSize` (continuation calls).
   * @returns A `SampleCursor` ready for `for await...of` iteration.
   * @experimental
   */
  sample(options?: { limit?: number; batchSize?: number }): SampleCursor {
    return new SampleCursor(this, options?.limit, options?.batchSize);
  }
}
