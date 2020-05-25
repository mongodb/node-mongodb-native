import { OperationBase } from './operation';
import { handleCallback, MongoDBNamespace } from '../utils';
import { MongoError } from '../error';

class ExecuteDbAdminCommandOperation extends OperationBase {
  db: any;
  selector: any;

  constructor(db: any, selector: any, options: any) {
    super(options);

    this.db = db;
    this.selector = selector;
  }

  execute(callback: Function) {
    const db = this.db;
    const selector = this.selector;
    const options = this.options;

    const namespace = new MongoDBNamespace('admin', '$cmd');
    db.s.topology.command(namespace, selector, options, (err?: any, result?: any) => {
      // Did the user destroy the topology
      if (db.serverConfig && db.serverConfig.isDestroyed()) {
        return callback(new MongoError('topology was destroyed'));
      }

      if (err) return handleCallback(callback, err);
      handleCallback(callback, null, result.result);
    });
  }
}

export = ExecuteDbAdminCommandOperation;
