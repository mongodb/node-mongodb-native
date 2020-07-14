import { Aspect, defineAspects } from './operation';
import CommandOperation = require('./command');
import { decorateWithCollation, decorateWithReadConcern } from '../utils';

class CountOperation extends CommandOperation {
  cursor: any;
  applySkipLimit: any;

  constructor(cursor: any, applySkipLimit: any, options: any) {
    super({ s: cursor }, options);

    this.cursor = cursor;
    this.applySkipLimit = applySkipLimit;
  }

  execute(server: any, callback: Function) {
    const cursor = this.cursor;
    const applySkipLimit = this.applySkipLimit;
    const options = this.options;

    if (applySkipLimit) {
      if (typeof cursor.cursorSkip() === 'number') options.skip = cursor.cursorSkip();
      if (typeof cursor.cursorLimit() === 'number') options.limit = cursor.cursorLimit();
    }

    if (
      typeof options.maxTimeMS !== 'number' &&
      cursor.cmd &&
      typeof cursor.cmd.maxTimeMS === 'number'
    ) {
      options.maxTimeMS = cursor.cmd.maxTimeMS;
    }

    let finalOptions = {} as any;
    finalOptions.skip = options.skip;
    finalOptions.limit = options.limit;
    finalOptions.hint = options.hint;
    finalOptions.maxTimeMS = options.maxTimeMS;

    // Command
    finalOptions.collectionName = cursor.namespace.collection;

    let command;
    try {
      command = buildCountCommand(cursor, cursor.cmd.query, finalOptions);
    } catch (err) {
      return callback(err);
    }

    super.executeCommand(server, command, (err?: any, result?: any) => {
      callback(err, result ? result.n : null);
    });
  }
}

/**
 * Build the count command.
 *
 * @function
 * @param {Collection|Cursor} collectionOrCursor an instance of a collection or cursor
 * @param {any} query The query for the count.
 * @param {any} [options] Optional settings. See Collection.prototype.count and Cursor.prototype.count for a list of options.
 */
function buildCountCommand(collectionOrCursor: any, query: any, options?: any) {
  const skip = options.skip;
  const limit = options.limit;
  let hint = options.hint;
  const maxTimeMS = options.maxTimeMS;
  query = query || {};

  // Final query
  const cmd = {
    count: options.collectionName,
    query: query
  } as any;

  if (collectionOrCursor.s.numberOfRetries) {
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

defineAspects(CountOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION
]);

export = CountOperation;
