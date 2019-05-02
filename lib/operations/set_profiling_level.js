'use strict';

const OperationBase = require('./operation').OperationBase;
const CommandOperation = require('./command');

class SetProfilingLevelOperation extends CommandOperation {
  constructor(db, level, options) {
    let profile = 0;

    if (level === 'off') {
      profile = 0;
    } else if (level === 'slow_only') {
      profile = 1;
    } else if (level === 'all') {
      profile = 2;
    }

    // Set up the profile number
    const command = { profile };
    super(db, command, options);
    this.level = level;
  }

  execute(callback) {
    if (this.level !== 'off' && this.level !== 'slow_only' && this.level !== 'all') {
      return callback(new Error('Error: illegal profiling level value ' + this.level));
    }

    super.execute((err, doc) => {
      if (err == null && doc.ok === 1) return callback(null, this.level);
      return err != null
        ? callback(err, null)
        : callback(new Error('Error with profile command'), null);
    });
  }
}

module.exports = SetProfilingLevelOperation;
