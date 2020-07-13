import { Aspect, defineAspects } from './operation';
import CommandOperation = require('./command');
import { handleCallback } from '../utils';

class DropIndexOperation extends CommandOperation {
  collection: any;
  indexName: any;

  constructor(collection: any, indexName: any, options: any) {
    super(collection, options);
    this.collection = collection;
    this.indexName = indexName;
  }

  execute(server: any, callback: Function) {
    const cmd = { dropIndexes: this.collection.collectionName, index: this.indexName };
    super.executeCommand(server, cmd, (err?: any, result?: any) => {
      if (typeof callback !== 'function') return;
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, null, result);
    });
  }
}

defineAspects(DropIndexOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
export = DropIndexOperation;
