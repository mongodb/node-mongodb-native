import type { Document, Timestamp } from '../bson';

/**
 * Options for creating a stream processor.
 * @public
 * @experimental
 */
export interface CreateStreamProcessorOptions {
  /** Dead letter queue connection configuration. */
  dlq?: Document;
  /** Name of the field that contains stream metadata. */
  streamMetaFieldName?: string;
  /** Compute tier for the processor. */
  tier?: StreamProcessorTier;
  /** Whether to enable failover for the processor. */
  failover?: boolean;
}

/**
 * Options for starting a stream processor.
 * @public
 * @experimental
 */
export interface StartStreamProcessorOptions {
  /** Number of worker threads. Sent at the top level of the command document. */
  workers?: number;
  /** If true, clear any existing checkpoints before starting. */
  clearCheckpoints?: boolean;
  /**
   * Resume from this cluster time.
   * Mutually exclusive with `startAfter`.
   */
  startAtOperationTime?: Timestamp;
  /**
   * Resume after the given resume token document.
   * Mutually exclusive with `startAtOperationTime`.
   */
  startAfter?: Document;
  /** Compute tier to use when starting. */
  tier?: StreamProcessorTier;
  /** Enable auto-scaling for the processor. */
  enableAutoScaling?: boolean;
  /** Failover configuration document. */
  failover?: Document;
}

/**
 * Options for `getStreamProcessorStats`.
 * @public
 * @experimental
 */
export interface GetStreamProcessorStatsOptions {
  /**
   * Scaling factor for size fields.
   * `1` = bytes (default), `1024` = KiB.
   */
  scale?: number;
  /** If true, include additional verbose fields in the response. */
  verbose?: boolean;
}

/**
 * Options for the spec-literal `getStreamProcessorSamples` entry point.
 * @public
 * @experimental
 */
export interface GetStreamProcessorSamplesOptions {
  /**
   * Absent or `0` opens a new cursor; non-zero continues an existing one.
   * Must be positive (non-zero) when used for continuation.
   */
  cursorId?: bigint | number;
  /** Maximum number of documents to return on the initial call. */
  limit?: number;
  /** Number of documents to return per continuation call. */
  batchSize?: number;
}

/**
 * Result returned by `getStreamProcessorSamples`.
 * `cursorId === 0` means the cursor is exhausted.
 * @public
 * @experimental
 */
export interface GetStreamProcessorSamplesResult {
  /** Server-assigned cursor ID. `0` or `0n` indicates exhaustion. */
  cursorId: bigint | number;
  /** Batch of sampled documents from the stream. */
  documents: Document[];
}

/**
 * Spec-defined compute tier values for stream processors.
 * @public
 * @experimental
 */
export type StreamProcessorTier = 'SP2' | 'SP5' | 'SP10' | 'SP30' | 'SP50';

/**
 * Snapshot of a stream processor's state as returned by `getStreamProcessor`.
 *
 * Per spec, `state` is a plain string — the driver must NOT enumerate it.
 * The full server response is preserved on `raw` so unknown fields survive.
 *
 * @public
 * @experimental
 */
export interface StreamProcessorInfo {
  /** Unique processor ID. Dev server may omit this field. */
  id?: string;
  /** Processor name. */
  name: string;
  /**
   * Current lifecycle state (e.g. `"CREATED"`, `"STARTED"`, `"STOPPED"`).
   * Treated as an open string — do not branch on a closed enum.
   */
  state: string;
  /** The aggregation pipeline that defines the processor's logic. */
  pipeline: Document[];
  /** Pipeline schema version. Dev server may omit this field. */
  pipelineVersion?: number;
  /** Compute tier. May be one of the known `StreamProcessorTier` values or an unrecognized string. */
  tier?: StreamProcessorTier | string;
  /** Dead letter queue configuration. */
  dlq?: Document;
  /** Name of the stream metadata field. */
  streamMetaFieldName?: string;
  /** Whether auto-scaling is enabled. */
  enableAutoScaling?: boolean;
  /** Whether failover is enabled. */
  failoverEnabled?: boolean;
  /** The active deployment region. */
  activeRegion?: string;
  /** Timestamp of the last modification. */
  lastModifiedAt?: Date;
  /** Identity of the last modifier. */
  modifiedBy?: string;
  /** Timestamp of the last state transition. */
  lastStateChange?: Date;
  /** Timestamp of the last heartbeat. */
  lastHeartbeat?: Date;
  /** Whether the processor has been started at least once. */
  hasStarted?: boolean;
  /** Latest statistics snapshot from the server. */
  stats?: Document;
  /** Human-readable error message if the processor is in an error state. */
  errorMsg?: string;
  /** Numeric error code if the processor is in an error state. */
  errorCode?: number;
  /** Whether the error is retryable. */
  errorRetryable?: boolean;
  /** Full server response, preserved verbatim so unknown fields survive. */
  raw: Document;
}
