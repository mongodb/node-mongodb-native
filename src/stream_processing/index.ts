/**
 * Atlas Stream Processing (experimental)
 *
 * Errors from ASP commands are surfaced as `MongoServerError`. The following
 * codes are known to be returned, but the list is non-exhaustive and may grow:
 *
 *   9   FailedToParse    Invalid pipeline or command document
 *   72  InvalidOptions   Invalid option values
 *   125 CommandFailed    General command execution failure
 *   1   InternalError    Unexpected server-side error
 *
 * Do NOT branch on this list as if it were closed — server may return new codes.
 */

export { SampleCursor } from './sample_cursor';
export { StreamProcessingClient } from './stream_processing_client';
export { StreamProcessor, StreamProcessors } from './stream_processors';
export * from './types';
