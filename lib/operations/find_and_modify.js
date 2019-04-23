'use strict';

const OperationBase = require('./operation').OperationBase;
const applyRetryableWrites = require('../utils').applyRetryableWrites;
const applyWriteConcern = require('../utils').applyWriteConcern;
const decorateWithCollation = require('../utils').decorateWithCollation;
const executeCommand = require('./db_ops').executeCommand;
const formattedOrderClause = require('../utils').formattedOrderClause;
const handleCallback = require('../utils').handleCallback;
const ReadPreference = require('mongodb-core').ReadPreference;

class FindOneAndDeleteOperation extends OperationBase {
  constructor(collection, query, sort, doc, options) {
    super(options);

    this.collection = collection;
    this.query = query;
    this.sort = sort;
    this.doc = doc;
  }

  execute(callback) {
    const coll = this.collection;
    const query = this.query;
    let sort = this.sort;
    const doc = this.doc;
    const options = this.options;

    // Create findAndModify command object
    const queryObject = {
      findAndModify: coll.s.name,
      query: query
    };

    sort = formattedOrderClause(sort);
    if (sort) {
      queryObject.sort = sort;
    }

    queryObject.new = options.new ? true : false;
    queryObject.remove = options.remove ? true : false;
    queryObject.upsert = options.upsert ? true : false;

    const projection = options.projection || options.fields;

    if (projection) {
      queryObject.fields = projection;
    }

    if (options.arrayFilters) {
      queryObject.arrayFilters = options.arrayFilters;
      delete options.arrayFilters;
    }

    if (doc && !options.remove) {
      queryObject.update = doc;
    }

    if (options.maxTimeMS) queryObject.maxTimeMS = options.maxTimeMS;

    // Either use override on the function, or go back to default on either the collection
    // level or db
    options.serializeFunctions = options.serializeFunctions || coll.s.serializeFunctions;

    // No check on the documents
    options.checkKeys = false;

    // Final options for retryable writes and write concern
    let finalOptions = Object.assign({}, options);
    finalOptions = applyRetryableWrites(finalOptions, coll.s.db);
    finalOptions = applyWriteConcern(finalOptions, { db: coll.s.db, collection: coll }, options);

    // Decorate the findAndModify command with the write Concern
    if (finalOptions.writeConcern) {
      queryObject.writeConcern = finalOptions.writeConcern;
    }

    // Have we specified bypassDocumentValidation
    if (finalOptions.bypassDocumentValidation === true) {
      queryObject.bypassDocumentValidation = finalOptions.bypassDocumentValidation;
    }

    finalOptions.readPreference = ReadPreference.primary;

    // Have we specified collation
    try {
      decorateWithCollation(queryObject, coll, finalOptions);
    } catch (err) {
      return callback(err, null);
    }

    // Execute the command
    executeCommand(coll.s.db, queryObject, finalOptions, (err, result) => {
      if (err) return handleCallback(callback, err, null);

      return handleCallback(callback, null, result);
    });
  }
}

module.exports = FindOneAndDeleteOperation;
