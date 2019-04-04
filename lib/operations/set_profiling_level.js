'use strict';

const OperationBase = require('./operation').OperationBase;
const CommandOperation = require('./command');

class SetProfilingLevelOperation extends OperationBase {
  constructor(db, level, options) {
    super(options);

    this.db = db;
    this.level = level;
  }

  execute(callback) {
    const db = this.db;
    const level = this.level;
    const options = this.options;

    const command = {};
    let profile = 0;

    if (level === 'off') {
      profile = 0;
    } else if (level === 'slow_only') {
      profile = 1;
    } else if (level === 'all') {
      profile = 2;
    } else {
      return callback(new Error('Error: illegal profiling level value ' + level));
    }

    // Set up the profile number
    command['profile'] = profile;

    const commandOperation = new CommandOperation(db, command, options);
    commandOperation.execute((err, doc) => {
      if (err == null && doc.ok === 1) return callback(null, level);
      return err != null
        ? callback(err, null)
        : callback(new Error('Error with profile command'), null);
    });
  }
}

module.exports = SetProfilingLevelOperation;
