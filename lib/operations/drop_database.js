'use strict';

const applyWriteConcern = require('../utils').applyWriteConcern;
const CommandOperation = require('./command');
const handleCallback = require('../utils').handleCallback;
const ReadPreference = require('../core').ReadPreference;

class DropDatabaseOperation extends CommandOperation {
  constructor(db, options) {
    // Ensure primary only
    const finalOptions = Object.assign({}, db.s.options, {
      readPreference: ReadPreference.PRIMARY
    });

    if (options.session) {
      finalOptions.session = options.session;
    }

    super(db, {}, finalOptions);
  }

  _buildCommand() {
    const db = this.db;
    const options = this.options;

    // Drop database command
    const cmd = { dropDatabase: 1 };

    // Decorate with write concern
    applyWriteConcern(cmd, { db }, options);

    return cmd;
  }

  execute(callback) {
    super.execute((err, result) => {
      if (callback == null) return;
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, null, result.ok ? true : false);
    });
  }
}

module.exports = DropDatabaseOperation;
