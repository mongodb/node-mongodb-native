import { ReadPreference, ReadPreferenceLike } from '../read_preference';
import { MongoError } from '../error';
import { Cursor, CursorOptions } from './cursor';
import { CursorState } from './core_cursor';
import type { Topology } from '../sdam/topology';
import type { CommandOperation } from '../operations/command';

/**
 * @file The **CommandCursor** class is an internal class that embodies a
 * generalized cursor based on a MongoDB command allowing for iteration over the
 * results returned. It supports one by one document iteration, conversion to an
 * array or can be iterated as a Node 0.10.X or higher stream
 *
 * **CommandCursor Cannot directly be instantiated**
 * @example
 * const MongoClient = require('mongodb').MongoClient;
 * const test = require('assert');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, client) {
 *   // Create a collection we want to drop later
 *   const col = client.db(dbName).collection('listCollectionsExample1');
 *   // Insert a bunch of documents
 *   col.insert([{a:1, b:1}
 *     , {a:2, b:2}, {a:3, b:3}
 *     , {a:4, b:4}], {w:1}, function(err, result) {
 *     expect(err).to.not.exist;
 *     // List the database collections available
 *     db.listCollections().toArray(function(err, items) {
 *       expect(err).to.not.exist;
 *       client.close();
 *     });
 *   });
 * });
 */

export type CommandCursorOptions = CursorOptions;

/**
 * Creates a new Command Cursor instance (INTERNAL TYPE, do not instantiate directly)
 *
 * @class CommandCursor
 * @extends external:Readable
 * @fires CommandCursor#data
 * @fires CommandCursor#end
 * @fires CommandCursor#close
 * @fires CommandCursor#readable
 * @returns {CommandCursor} an CommandCursor instance.
 */
export class CommandCursor extends Cursor<CommandOperation, CommandCursorOptions> {
  constructor(topology: Topology, operation: CommandOperation, options?: CommandCursorOptions) {
    super(topology, operation, options);
  }

  /**
   * Set the ReadPreference for the cursor.
   *
   * @param {(string|ReadPreference)} readPreference The new read preference for the cursor.
   * @throws {MongoError}
   * @returns {Cursor}
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
   * @param {number} value The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/find/|find command documentation}.
   * @throws {MongoError}
   * @returns {CommandCursor}
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
   * @param {number} value The state maxTimeMS value.
   * @returns {CommandCursor}
   */
  maxTimeMS(value: number): this {
    if (this.topology.lastIsMaster().minWireVersion > 2) {
      this.cmd.maxTimeMS = value;
    }

    return this;
  }
}
