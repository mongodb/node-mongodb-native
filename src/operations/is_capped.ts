import { OptionsOperation } from './options_operation';
import type { Callback } from '../utils';
import type { Collection } from '../collection';
import type { OperationOptions } from './operation';
import type { Server } from '../sdam/server';

export class IsCappedOperation extends OptionsOperation {
  constructor(collection: Collection, options: OperationOptions) {
    super(collection, options);
  }

  execute(server: Server, callback: Callback): void {
    super.execute(server, (err, document) => {
      if (err) return callback(err);
      callback(undefined, !!(document && document.capped));
    });
  }
}
