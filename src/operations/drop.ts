'use strict';

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

    super(db, finalOptions);
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
    this.namespace = `${db.namespace}.${name}`;
  }

  _buildCommand() {
    return { drop: this.name };
  }
}

class DropDatabaseOperation extends DropOperation {
  _buildCommand() {
    return { dropDatabase: 1 };
  }
}

module.exports = {
  DropOperation,
  DropCollectionOperation,
  DropDatabaseOperation
};
