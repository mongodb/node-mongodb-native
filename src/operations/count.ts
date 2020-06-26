'use strict';
import { buildCountCommand } from './common_functions';
import { OperationBase } from './operation';

class CountOperation extends OperationBase {
  cursor: any;
  applySkipLimit: any;

  constructor(cursor: any, applySkipLimit: any, options: any) {
    super(options);

    this.cursor = cursor;
    this.applySkipLimit = applySkipLimit;
  }

  execute(callback: Function) {
    const cursor = this.cursor;
    const applySkipLimit = this.applySkipLimit;
    const options = this.options;

    if (applySkipLimit) {
      if (typeof cursor.cursorSkip() === 'number') options.skip = cursor.cursorSkip();
      if (typeof cursor.cursorLimit() === 'number') options.limit = cursor.cursorLimit();
    }

    // Ensure we have the right read preference inheritance
    if (options.readPreference) {
      cursor.setReadPreference(options.readPreference);
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

    // Set cursor server to the same as the topology
    cursor.server = cursor.topology.s.coreTopology;

    // Execute the command
    cursor.topology.command(
      cursor.namespace.withCollection('$cmd'),
      command,
      cursor.options,
      (err?: any, result?: any) => {
        callback(err, result ? result.result.n : null);
      }
    );
  }
}

export = CountOperation;
