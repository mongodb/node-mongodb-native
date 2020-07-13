import { Aspect, defineAspects } from './operation';
import { buildCountCommand } from './common_functions';
import CommandOperation = require('./command');

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

defineAspects(CountOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION
]);

export = CountOperation;
