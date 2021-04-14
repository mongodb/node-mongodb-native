'use strict';

const applyRetryableWrites = require('../utils').applyRetryableWrites;
const applyWriteConcern = require('../utils').applyWriteConcern;
const MongoError = require('../core').MongoError;
const OperationBase = require('./operation').OperationBase;

class BulkWriteOperation extends OperationBase {
  constructor(collection, operations, options) {
    super(options);

    this.collection = collection;
    this.operations = operations;
  }

  execute(callback) {
    const coll = this.collection;
    const operations = this.operations;
    let options = this.options;

    // Add ignoreUndfined
    if (coll.s.options.ignoreUndefined) {
      options = Object.assign({}, options);
      options.ignoreUndefined = coll.s.options.ignoreUndefined;
    }

    // Create the bulk operation
    const bulk =
      options.ordered === true || options.ordered == null
        ? coll.initializeOrderedBulkOp(options)
        : coll.initializeUnorderedBulkOp(options);

    // Do we have a collation
    let collation = false;

    // for each op go through and add to the bulk
    try {
      for (let i = 0; i < operations.length; i++) {
        // Get the operation type
        const key = Object.keys(operations[i])[0];
        // Check if we have a collation
        if (operations[i][key].collation) {
          collation = true;
        }

        // Pass to the raw bulk
        bulk.raw(operations[i]);
      }
    } catch (err) {
      return callback(err, null);
    }

    // Final options for retryable writes and write concern
    let finalOptions = Object.assign({}, options);
    finalOptions = applyRetryableWrites(finalOptions, coll.s.db);
    finalOptions = applyWriteConcern(finalOptions, { db: coll.s.db, collection: coll }, options);

    const writeCon = finalOptions.writeConcern ? finalOptions.writeConcern : {};
    const capabilities = coll.s.topology.capabilities();

    // Did the user pass in a collation, check if our write server supports it
    if (collation && capabilities && !capabilities.commandsTakeCollation) {
      return callback(new MongoError('server/primary/mongos does not support collation'));
    }

    // Execute the bulk
    bulk.execute(writeCon, finalOptions, (err, r) => {
      // We have connection level error
      if (!r && err) {
        return callback(err, null);
      }

      // Update the n
      r.n = r.insertedCount;

      // Inserted documents
      const inserted = r.getInsertedIds();
      // Map inserted ids
      for (let i = 0; i < inserted.length; i++) {
        r.insertedIds[inserted[i].index] = inserted[i]._id;
      }

      // Upserted documents
      const upserted = r.getUpsertedIds();
      // Map upserted ids
      for (let i = 0; i < upserted.length; i++) {
        r.upsertedIds[upserted[i].index] = upserted[i]._id;
      }

      // Return the results
      callback(null, r);
    });
  }
}

module.exports = BulkWriteOperation;
