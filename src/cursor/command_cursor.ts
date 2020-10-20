import { ReadPreference, ReadPreferenceLike } from '../read_preference';
import { MongoError } from '../error';
import { Cursor, CursorOptions, CursorState } from './cursor';
import type { Topology } from '../sdam/topology';
import type { CommandOperation } from '../operations/command';

/** @public */
export type CommandCursorOptions = CursorOptions;

/**
 * The **CommandCursor** class is an internal class that embodies a
 * generalized cursor based on a MongoDB command allowing for iteration over the
 * results returned. It supports one by one document iteration, conversion to an
 * array or can be iterated as a Node 0.10.X or higher stream
 * @public
 */
export class CommandCursor extends Cursor<CommandOperation, CommandCursorOptions> {
  /** @internal */
  constructor(topology: Topology, operation: CommandOperation, options?: CommandCursorOptions) {
    super(topology, operation, options);
  }

  /**
   * Set the ReadPreference for the cursor.
   *
   * @param readPreference - The new read preference for the cursor.
   */
  setReadPreference(readPreference: ReadPreferenceLike): this {
    if (this.s.state === CursorState.CLOSED || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    if (this.s.state !== CursorState.INIT) {
      throw new MongoError('cannot change cursor readPreference after cursor has been accessed');
    }

    if (readPreference instanceof ReadPreference) {
      this.options.readPreference = readPreference;
    } else if (typeof readPreference === 'string') {
      this.options.readPreference = ReadPreference.fromString(readPreference);
    } else {
      throw new TypeError('Invalid read preference: ' + readPreference);
    }

    return this;
  }

  /**
   * Set the batch size for the cursor.
   *
   * @param value - The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/find/|find command documentation}.
   * @throws MongoError if cursor is closed/dead or value is not a number
   */
  batchSize(value: number): this {
    if (this.s.state === CursorState.CLOSED || this.isDead()) {
      throw new MongoError('Cursor is closed');
    }

    if (typeof value !== 'number') {
      throw new MongoError('batchSize requires an integer');
    }

    if (this.cmd.cursor) {
      this.cmd.cursor.batchSize = value;
    }

    this.cursorBatchSize = value;
    return this;
  }

  /**
   * Add a maxTimeMS stage to the aggregation pipeline
   *
   * @param value - The state maxTimeMS value.
   */
  maxTimeMS(value: number): this {
    if (this.topology.lastIsMaster().minWireVersion > 2) {
      this.cmd.maxTimeMS = value;
    }

    return this;
  }
}
