'use strict';

const operation = require('./operation');
const Aspect = operation.Aspect;
const defineAspects = operation.defineAspects;
const OperationBase = operation.OperationBase;

const applyRetryableWrites = require('../utils').applyRetryableWrites;
const applyWriteConcern = require('../utils').applyWriteConcern;
const decorateWithCollation = require('../utils').decorateWithCollation;
const formattedOrderClause = require('../utils').formattedOrderClause;
const handleCallback = require('../utils').handleCallback;
const isRetryabilitySupported = require('../utils').isRetryabilitySupported;
const ReadPreference = require('../core').ReadPreference;

class CrudFindAndModifyModel {
  constructor(args) {
    this.collection = args.collection;
    this.query = args.query;
    this.doc = args.doc;

    // Build Options
    let options = args.options;
    const collection = this.collection;
    const db = this.collection.s.db;
    options = applyRetryableWrites(options, db);
    options = applyWriteConcern(options, { db, collection }, options);
    options.serializeFunctions = options.serializeFunctions || collection.s.serializeFunctions;
    options.checkKeys = false;
    this.options = options;

    this.namespace = this.collection.s.namespace.withCollection('$cmd');
  }

  buildCommand(/* server */) {
    const collection = this.collection;
    const query = this.query;
    const doc = this.doc;
    const options = this.options;
    const sort = formattedOrderClause(options.sort);

    const queryObject = {
      findAndModify: collection.collectionName,
      query,
      new: !!this.new,
      remove: !!this.remove,
      upsert: !!this.upsert
    };

    const projection = options.projection || options.fields;

    if (sort) {
      queryObject.sort = sort;
    }

    if (projection) {
      queryObject.fields = projection;
    }

    if (options.arrayFilters) {
      queryObject.arrayFilters = options.arrayFilters;
    }

    if (doc && !this.remove) {
      queryObject.update = doc;
    }

    if (options.maxTimeMS) {
      queryObject.maxTimeMS = options.maxTimeMS;
    }

    // Decorate the findAndModify command with the write Concern
    if (options.writeConcern) {
      queryObject.writeConcern = options.writeConcern;
    }

    // Have we specified bypassDocumentValidation
    if (options.bypassDocumentValidation === true) {
      queryObject.bypassDocumentValidation = options.bypassDocumentValidation;
    }

    decorateWithCollation(queryObject, collection, options);

    return queryObject;
  }
}

class FindOneAndDeleteModel extends CrudFindAndModifyModel {
  constructor(args) {
    super(args);
    this.remove = true;
  }
}

class FindOneAndUpdateModel extends CrudFindAndModifyModel {
  constructor(args) {
    super(args);

    const options = this.options;
    this.new = typeof options.returnOriginal === 'boolean' ? !options.returnOriginal : false;
    this.upsert = typeof options.upsert === 'boolean' ? options.upsert : false;
  }
}

class FindAndModifyOperation extends OperationBase {
  constructor(model) {
    super(model.options);
    this.model = model;
    this.readPreference = ReadPreference.primary;
  }

  canRetry(server, topology) {
    return (
      this.options.retryWrites &&
      this.session &&
      !this.session.inTransaction() &&
      isRetryabilitySupported(topology)
    );
  }

  enableRetry() {
    this.options.willRetryWrite = true;
    this.session.incrementTransactionNumber();
  }

  execute(server, callback) {
    let command;
    try {
      command = this.model.buildCommand(server);
    } catch (err) {
      return callback(err, null);
    }

    const ns = this.model.namespace.toString();
    const options = this.options;

    server.command(ns, command, options, (err, result) => {
      if (err) {
        return handleCallback(callback, err, null);
      }

      if (options.full) {
        return handleCallback(callback, null, result);
      }

      return handleCallback(callback, null, result.result);
    });
  }
}

defineAspects(FindAndModifyOperation, [Aspect.EXECUTE_WITH_SELECTION, Aspect.RETRY]);

module.exports = {
  FindAndModifyOperation,
  FindOneAndDeleteModel,
  FindOneAndUpdateModel
};
