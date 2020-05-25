import { Aspect, defineAspects } from './operation';
import CommandOperation = require('./command');
import { applyWriteConcern, handleCallback } from '../utils';

class DropIndexOperation extends CommandOperation {
  collection: any;
  indexName: any;

  constructor(collection: any, indexName: any, options: any) {
    super(collection.s.db, options, collection);

    this.collection = collection;
    this.indexName = indexName;
  }

  _buildCommand() {
    const collection = this.collection;
    const indexName = this.indexName;
    const options = this.options;

    let cmd = { dropIndexes: collection.collectionName, index: indexName };

    // Decorate command with writeConcern if supported
    cmd = applyWriteConcern(cmd, { db: collection.s.db, collection }, options);

    return cmd;
  }

  execute(callback: Function) {
    // Execute command
    super.execute((err?: any, result?: any) => {
      if (typeof callback !== 'function') return;
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, null, result);
    });
  }
}

defineAspects(DropIndexOperation, Aspect.WRITE_OPERATION);

export = DropIndexOperation;
