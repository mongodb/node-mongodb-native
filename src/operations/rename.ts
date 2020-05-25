import { OperationBase } from './operation';
import { applyWriteConcern, checkCollectionName, handleCallback, toError } from '../utils';
import { executeDbAdminCommand } from './db_ops';
import { loadCollection } from '../dynamic_loaders';

class RenameOperation extends OperationBase {
  collection: any;
  newName: any;

  constructor(collection: any, newName: any, options: any) {
    super(options);

    this.collection = collection;
    this.newName = newName;
  }

  execute(callback: Function) {
    const coll = this.collection;
    const newName = this.newName;
    const options = this.options;

    let Collection = loadCollection();
    // Check the collection name
    checkCollectionName(newName);
    // Build the command
    const renameCollection = coll.namespace;
    const toCollection = coll.s.namespace.withCollection(newName).toString();
    const dropTarget = typeof options.dropTarget === 'boolean' ? options.dropTarget : false;
    const cmd = { renameCollection: renameCollection, to: toCollection, dropTarget: dropTarget };

    // Decorate command with writeConcern if supported
    applyWriteConcern(cmd, { db: coll.s.db, collection: coll }, options);

    // Execute against admin
    executeDbAdminCommand(coll.s.db.admin().s.db, cmd, options, (err?: any, doc?: any) => {
      if (err) return handleCallback(callback, err, null);
      // We have an error
      if (doc.errmsg) return handleCallback(callback, toError(doc), null);
      try {
        return handleCallback(
          callback,
          null,
          new Collection(
            coll.s.db,
            coll.s.topology,
            coll.s.namespace.db,
            newName,
            coll.s.pkFactory,
            coll.s.options
          )
        );
      } catch (err) {
        return handleCallback(callback, toError(err), null);
      }
    });
  }
}

export = RenameOperation;
