'use strict';
import { Aspect, defineAspects } from './operation';
import DropIndexOperation = require('./drop_index');
import { handleCallback } from '../utils';

class DropIndexesOperation extends DropIndexOperation {
  constructor(collection: any, options: any) {
    super(collection, '*', options);
  }

  execute(callback: Function) {
    super.execute((err: any) => {
      if (err) return handleCallback(callback, err, false);
      handleCallback(callback, null, true);
    });
  }
}

defineAspects(DropIndexesOperation, Aspect.WRITE_OPERATION);

export = DropIndexesOperation;
