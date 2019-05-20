'use strict';

const MongoError = require('../core').MongoError;
const OperationBase = require('./operation').OperationBase;
const defineAspects = require('./operation').defineAspects;
const Aspect = require('./operation').Aspect;

function bulkWriteCallback(callback, err, r) {
  // We have connection level error
  if (!r && err) {
    return callback(err, null);
  }

  r.insertedCount = r.nInserted;
  r.matchedCount = r.nMatched;
  r.modifiedCount = r.nModified || 0;
  r.deletedCount = r.nRemoved;
  r.upsertedCount = r.getUpsertedIds().length;
  r.upsertedIds = {};
  r.insertedIds = {};

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
}

class BulkWriteOperation extends OperationBase {
  constructor(collection, operations, options) {
    super(options);

    this.collection = collection;
    this.operations = operations;
  }

  execute(callback) {
    const coll = this.collection;
    const operations = this.operations;
    const options = Object.assign({}, this.options);

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

    const capabilities = coll.s.topology.capabilities();

    // Did the user pass in a collation, check if our write server supports it
    if (collation && capabilities && !capabilities.commandsTakeCollation) {
      return callback(new MongoError('server/primary/mongos does not support collation'));
    }

    // Execute the bulk
    bulk.execute(undefined, options, (err, r) => bulkWriteCallback(callback, err, r));
  }
}

defineAspects(BulkWriteOperation, [Aspect.META_OPERATION]);

module.exports = BulkWriteOperation;
