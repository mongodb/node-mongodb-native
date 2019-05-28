'use strict';

const applyWriteConcern = require('../utils').applyWriteConcern;
const Aspect = require('./operation').Aspect;
const CommandOperation = require('./command');
const defineAspects = require('./operation').defineAspects;
const handleCallback = require('../utils').handleCallback;

class DropOperation extends CommandOperation {
  constructor(db, options) {
    const finalOptions = Object.assign({}, options, db.s.options);

    if (options.session) {
      finalOptions.session = options.session;
    }

    super(db, {}, finalOptions);
  }

  _buildCommand(command) {
    const db = this.db;
    const options = this.options;

    // Decorate with write concern
    applyWriteConcern(command, { db }, options);

    return command;
  }

  execute(callback) {
    super.execute((err, result) => {
      if (err) return handleCallback(callback, err);
      if (result.ok) return handleCallback(callback, null, true);
      handleCallback(callback, null, false);
    });
  }
}

defineAspects(DropOperation, Aspect.WRITE_OPERATION);

class DropCollectionOperation extends DropOperation {
  constructor(db, name, options) {
    super(db, options);

    this.name = name;
  }

  _buildCommand() {
    return super._buildCommand({ drop: this.name });
  }
}

class DropDatabaseOperation extends DropOperation {
  _buildCommand() {
    return super._buildCommand({ dropDatabase: 1 });
  }
}

module.exports = {
  DropOperation,
  DropCollectionOperation,
  DropDatabaseOperation
};
