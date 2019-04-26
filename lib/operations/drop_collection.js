'use strict';

const CommandOperation = require('./command');
const handleCallback = require('../utils').handleCallback;

class DropCollectionOperation extends CommandOperation {
  constructor(db, command, options) {
    super(db, command, options);
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
