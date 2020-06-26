'use strict';
import { OperationBase } from './operation';
import { handleCallback } from '../utils';
import { indexInformation as indexInformationDb } from './db_ops';

class IndexExistsOperation extends OperationBase {
  collection: any;
  indexes: any;

  constructor(collection: any, indexes: any, options: any) {
    super(options);

    this.collection = collection;
    this.indexes = indexes;
  }

  execute(callback: Function) {
    const coll = this.collection;
    const indexes = this.indexes;
    const options = this.options;

    indexInformationDb(
      coll.s.db,
      coll.collectionName,
      options,
      (err?: any, indexInformation?: any) => {
        // If we have an error return
        if (err != null) return handleCallback(callback, err, null);
        // Let's check for the index names
        if (!Array.isArray(indexes))
          return handleCallback(callback, null, indexInformation[indexes] != null);
        // Check in list of indexes
        for (let i = 0; i < indexes.length; i++) {
          if (indexInformation[indexes[i]] == null) {
            return handleCallback(callback, null, false);
          }
        }

        // All keys found return true
        return handleCallback(callback, null, true);
      }
    );
  }
}

export = IndexExistsOperation;
