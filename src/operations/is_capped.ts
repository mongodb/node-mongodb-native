import OptionsOperation = require('./options_operation');
import { handleCallback } from '../utils';

class IsCappedOperation extends OptionsOperation {
  constructor(collection: any, options: any) {
    super(collection, options);
  }

  execute(callback: Function) {
    super.execute((err?: any, document?: any) => {
      if (err) return handleCallback(callback, err);
      handleCallback(callback, null, !!(document && document.capped));
    });
  }
}

export = IsCappedOperation;
