import type { Document } from '../bson';
import type { StreamProcessor } from './stream_processors';
import type { GetStreamProcessorSamplesOptions } from './types';

/**
 * An async-iterable cursor over Atlas Stream Processing sample output.
 *
 * Does not extend `AbstractCursor`; uses the dedicated
 * `startSampleStreamProcessor` / `getMoreSampleStreamProcessor` wire commands.
 * Server-side exhaustion is signalled by `cursorId === 0`.
 *
 * @public
 * @experimental
 */
export class SampleCursor implements AsyncIterable<Document> {
  private buffer: Document[] = [];
  private currentCursorId: bigint | number | null = null;
  private exhausted = false;
  private closed = false;

  /**
   * @param processor - The `StreamProcessor` to sample from.
   * @param limit - Maximum documents requested on the initial wire call.
   * @param batchSize - Documents per continuation wire call.
   */
  constructor(
    private readonly processor: StreamProcessor,
    private readonly limit?: number,
    private readonly batchSize?: number
  ) {}

  /**
   * The current server-assigned cursor ID.
   * `null` before the first wire call; `0` or `0n` when exhausted.
   * @experimental
   */
  get cursorId(): bigint | number | null {
    return this.currentCursorId;
  }

  /**
   * `true` if the cursor has not been exhausted or closed.
   * @experimental
   */
  get alive(): boolean {
    return !this.exhausted && !this.closed;
  }

  /**
   * Marks the cursor closed. ASP has no kill-cursors equivalent;
   * the server reclaims the cursor independently.
   *
   * @experimental
   */
  async close(): Promise<void> {
    this.closed = true;
    // ASP has no kill-cursors equivalent; server cleans up on its own.
  }

  /**
   * Returns an async iterator over the sampled documents.
   * Implements the `AsyncIterable<Document>` contract.
   *
   * @experimental
   */
  [Symbol.asyncIterator](): AsyncIterableIterator<Document> {
    return this.iterator();
  }

  /**
   * Async generator that yields documents from the server in batches.
   * Continues until the cursor is exhausted (`cursorId === 0`) or closed.
   *
   * @experimental
   */
  async *iterator(): AsyncIterableIterator<Document> {
    while (!this.closed) {
      const doc = this.buffer.shift();
      if (doc != null) {
        yield doc;
        continue;
      }
      if (this.exhausted) return;
      await this.refill();
      // Guard: empty batch with non-zero cursorId continues iteration on next loop.
      if (this.buffer.length === 0 && this.exhausted) return;
    }
  }

  private async refill(): Promise<void> {
    if (this.exhausted || this.closed) return;
    // Mirrors Python's AsyncSampleCursor._refill exactly:
    // null currentCursorId means not yet opened → send limit only.
    // Non-null means continuation → send cursorId + batchSize only.
    const opts: GetStreamProcessorSamplesOptions =
      this.currentCursorId == null
        ? { limit: this.limit }
        : { cursorId: this.currentCursorId, batchSize: this.batchSize };
    const result = await this.processor.getStreamProcessorSamples(opts);
    this.currentCursorId = result.cursorId;
    this.buffer.push(...result.documents);
    if (Number(result.cursorId) === 0) this.exhausted = true;
  }
}
