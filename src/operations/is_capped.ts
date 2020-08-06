import { OptionsOperation } from './options_operation';
import { handleCallback } from '../utils';
import type { Callback } from '../types';
import type { Collection } from '../collection';

export class IsCappedOperation extends OptionsOperation {
  constructor(collection: Collection, options: any) {
    super(collection, options);
  }

  execute(callback: Callback): void {
    super.execute((err, document) => {
      if (err) return handleCallback(callback, err);
      handleCallback(callback, null, !!(document && document.capped));
    });
  }
}
