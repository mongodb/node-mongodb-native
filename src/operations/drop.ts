'use strict';
import { Aspect, defineAspects } from './operation';
import CommandOperation = require('./command');
import { handleCallback } from '../utils';

class DropOperation extends CommandOperation {
  constructor(db: any, options: any) {
    const finalOptions = Object.assign({}, options, db.s.options);

    if (options.session) {
      finalOptions.session = options.session;
    }

    super(db, finalOptions);
  }

  execute(callback: Function) {
    super.execute((err?: any, result?: any) => {
      if (err) return handleCallback(callback, err);
      if (result.ok) return handleCallback(callback, null, true);
      handleCallback(callback, null, false);
    });
  }
}

defineAspects(DropOperation, Aspect.WRITE_OPERATION);

class DropCollectionOperation extends DropOperation {
  name: any;

  constructor(db: any, name: any, options: any) {
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

export { DropOperation, DropCollectionOperation, DropDatabaseOperation };
