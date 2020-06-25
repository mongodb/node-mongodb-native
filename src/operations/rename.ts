'use strict';

const OperationBase = require('./operation').OperationBase;
const applyWriteConcern = require('../utils').applyWriteConcern;
const checkCollectionName = require('../utils').checkCollectionName;
const executeDbAdminCommand = require('./db_ops').executeDbAdminCommand;
const handleCallback = require('../utils').handleCallback;
const loadCollection = require('../dynamic_loaders').loadCollection;
const toError = require('../utils').toError;

class RenameOperation extends OperationBase {
  constructor(collection, newName, options) {
    super(options);

    this.collection = collection;
    this.newName = newName;
  }

  execute(callback) {
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
    executeDbAdminCommand(coll.s.db.admin().s.db, cmd, options, (err, doc) => {
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

module.exports = RenameOperation;
