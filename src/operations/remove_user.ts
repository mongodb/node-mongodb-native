import { Aspect, defineAspects } from './operation';
import CommandOperation = require('./command');
import { handleCallback } from '../utils';
import WriteConcern = require('../write_concern');

class RemoveUserOperation extends CommandOperation {
  username: any;

  constructor(db: any, username: any, options: any) {
    const commandOptions = {} as any;

    const writeConcern = WriteConcern.fromOptions(options);
    if (writeConcern != null) {
      commandOptions.writeConcern = writeConcern;
    }

    if (options.dbName) {
      commandOptions.dbName = options.dbName;
    }

    // Add maxTimeMS to options if set
    if (typeof options.maxTimeMS === 'number') {
      commandOptions.maxTimeMS = options.maxTimeMS;
    }

    super(db, commandOptions);

    this.username = username;
  }

  _buildCommand() {
    const username = this.username;

    // Build the command to execute
    const command = { dropUser: username };

    return command;
  }

  execute(callback: Function) {
    // Attempt to execute command
    super.execute((err?: any, result?: any) => {
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, err, result.ok ? true : false);
    });
  }
}

defineAspects(RemoveUserOperation, Aspect.WRITE_OPERATION);
export = RemoveUserOperation;
