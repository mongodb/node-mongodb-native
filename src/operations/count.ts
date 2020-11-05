import { Aspect, defineAspects } from './operation';
import { CommandOperation, CommandOperationOptions } from './command';
import { decorateWithCollation, decorateWithReadConcern, Callback } from '../utils';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { Cursor } from '../cursor/cursor';

/** @public */
export interface CountOptions extends CommandOperationOptions {
  /** The number of documents to skip. */
  skip?: number;
  /** The maximum amounts to count before aborting. */
  limit?: number;
  /** Number of milliseconds to wait before aborting the query. */
  maxTimeMS?: number;
  /** An index name hint for the query. */
  hint?: string | Document;
}

type BuildCountCommandOptions = CountOptions & { collectionName: string };

/** @internal */
export class CountOperation extends CommandOperation<CountOptions, number> {
  cursor: Cursor;
  applySkipLimit: boolean;

  constructor(cursor: Cursor, applySkipLimit: boolean, options: CountOptions) {
    super(({ s: cursor } as unknown) as Collection, options);

    this.cursor = cursor;
    this.applySkipLimit = applySkipLimit;
  }

  execute(server: Server, callback: Callback<number>): void {
    const cursor = this.cursor;
    const applySkipLimit = this.applySkipLimit;
    const options = this.options;

    if (applySkipLimit) {
      if (typeof cursor.cursorSkip === 'number') options.skip = cursor.cursorSkip;
      if (typeof cursor.cursorLimit === 'number') options.limit = cursor.cursorLimit;
    }

    if (
      typeof options.maxTimeMS !== 'number' &&
      cursor.cmd &&
      typeof cursor.cmd.maxTimeMS === 'number'
    ) {
      options.maxTimeMS = cursor.cmd.maxTimeMS;
    }

    const finalOptions: BuildCountCommandOptions = {
      collectionName: cursor.namespace.collection ?? ''
    };

    finalOptions.skip = options.skip;
    finalOptions.limit = options.limit;
    finalOptions.hint = options.hint;
    finalOptions.maxTimeMS = options.maxTimeMS;

    let command;
    try {
      command = buildCountCommand(cursor, cursor.cmd.query, finalOptions);
    } catch (err) {
      return callback(err);
    }

    super.executeCommand(server, command, (err, result) => {
      callback(err, result ? result.n : 0);
    });
  }
}

/**
 * Build the count command.
 *
 * @param collectionOrCursor - an instance of a collection or cursor
 * @param query - The query for the count.
 * @param options - Optional settings. See Collection.prototype.count and Cursor.prototype.count for a list of options.
 */
function buildCountCommand(
  collectionOrCursor: Collection | Cursor,
  query: Document,
  options: BuildCountCommandOptions
) {
  const skip = options.skip;
  const limit = options.limit;
  let hint = options.hint;
  const maxTimeMS = options.maxTimeMS;
  query = query || {};

  // Final query
  const cmd: Document = {
    count: options.collectionName,
    query: query
  };

  if (isCursor(collectionOrCursor)) {
    // collectionOrCursor is a cursor
    if (collectionOrCursor.options.hint) {
      hint = collectionOrCursor.options.hint;
    } else if (collectionOrCursor.cmd.hint) {
      hint = collectionOrCursor.cmd.hint;
    }
    decorateWithCollation(cmd, collectionOrCursor, collectionOrCursor.cmd);
  } else {
    decorateWithCollation(cmd, collectionOrCursor, options);
  }

  // Add limit, skip and maxTimeMS if defined
  if (typeof skip === 'number') cmd.skip = skip;
  if (typeof limit === 'number') cmd.limit = limit;
  if (typeof maxTimeMS === 'number') cmd.maxTimeMS = maxTimeMS;
  if (hint) cmd.hint = hint;

  // Do we have a readConcern specified
  decorateWithReadConcern(cmd, collectionOrCursor);

  return cmd;
}

function isCursor(c: Collection | Cursor): c is Cursor {
  return 'numberOfRetries' in c.s && 'undefined' !== typeof c.s.numberOfRetries;
}

defineAspects(CountOperation, [Aspect.READ_OPERATION, Aspect.RETRYABLE]);
