'use strict';

const CommandOperation = require('./command');
const levelValues = new Set(['off', 'slow_only', 'all']);

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

    super(db, options);
    this.level = level;
    this.profile = profile;
  }

  _buildCommand() {
    const profile = this.profile;

    // Set up the profile number
    const command = { profile };

    return command;
  }

  execute(callback) {
    const level = this.level;

    if (!levelValues.has(level)) {
      return callback(new Error('Error: illegal profiling level value ' + level));
    }

    super.execute((err, doc) => {
      if (err == null && doc.ok === 1) return callback(null, level);
      return err != null
        ? callback(err, null)
        : callback(new Error('Error with profile command'), null);
    });
  }
}

module.exports = SetProfilingLevelOperation;
