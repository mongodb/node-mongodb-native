'use strict';

const CommandOperation = require('./command');
const handleCallback = require('../utils').handleCallback;

class DropDatabaseOperation extends CommandOperation {
  constructor(db, command, options) {
    super(db, command, options);
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
