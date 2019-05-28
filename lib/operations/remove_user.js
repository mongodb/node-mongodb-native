'use strict';

const Aspect = require('./operation').Aspect;
const CommandOperation = require('./command');
const defineAspects = require('./operation').defineAspects;
const handleCallback = require('../utils').handleCallback;
const WriteConcern = require('../write_concern');

class RemoveUserOperation extends CommandOperation {
  constructor(db, username, options) {
    const commandOptions = {};

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

  execute(callback) {
    // Attempt to execute command
    super.execute((err, result) => {
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, err, result.ok ? true : false);
    });
  }
}

defineAspects(RemoveUserOperation, [Aspect.WRITE_OPERATION, Aspect.SKIP_SESSIONS]);

module.exports = RemoveUserOperation;
