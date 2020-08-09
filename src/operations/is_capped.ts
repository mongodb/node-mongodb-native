import { OptionsOperation } from './options_operation';
import type { Callback } from '../types';
import type { Collection } from '../collection';
import type { OperationOptions } from './operation';

export class IsCappedOperation extends OptionsOperation {
  constructor(collection: Collection, options: OperationOptions) {
    super(collection, options);
  }

  execute(callback: Callback): void {
    super.execute((err, document) => {
      if (err) return callback(err);
      callback(undefined, !!(document && document.capped));
    });
  }
}
