'use strict';

const applyWriteConcern = require('../utils').applyWriteConcern;
const CommandOperation = require('./command');
const handleCallback = require('../utils').handleCallback;
const ReadPreference = require('../core').ReadPreference;

class DropCollectionOperation extends CommandOperation {
  constructor(db, name, options) {
    // options
    const opts = Object.assign({}, db.s.options, { readPreference: ReadPreference.PRIMARY });
    if (options.session) {
      opts.session = options.session;
    }

    super(db, {}, opts);

    this.name = name;
  }

  _buildCommand() {
    const db = this.db;
    const name = this.name;
    const options = this.options;

    // Command to execute
    const cmd = { drop: name };

    // Decorate with write concern
    applyWriteConcern(cmd, { db }, options);

    return cmd;
  }

  execute(callback) {
    super.execute((err, result) => {
      if (err) return handleCallback(callback, err);
      if (result.ok) return handleCallback(callback, null, true);
      handleCallback(callback, null, false);
    });
  }
}

module.exports = DropCollectionOperation;
