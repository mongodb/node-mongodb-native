import { OptionsOperation } from './options_operation';
import { handleCallback } from '../utils';
import type { Callback } from '../types';

export class IsCappedOperation extends OptionsOperation {
  constructor(collection: any, options: any) {
    super(collection, options);
  }

  execute(callback: Callback) {
    super.execute((err?: any, document?: any) => {
      if (err) return handleCallback(callback, err);
      handleCallback(callback, null, !!(document && document.capped));
    });
  }
}
