'use strict';

const { formattedOrderClause } = require('../utils');
const CommandOperationV2 = require('./command_v2.js');
const { Aspect, defineAspects } = require('./operation');

class FindAndModifyOperation extends CommandOperationV2 {
  constructor(collection, query, sort, doc, options) {
    // Either use override on the function, or go back to default on either the collection level or db
    options.serializeFunctions = options.serializeFunctions || collection.s.serializeFunctions;

    // No check on the documents
    options.checkKeys = false;

    super(collection, options);

    this.collection = collection;
    this.query = query;
    this.sort = sort;
    this.doc = doc;
  }

  execute(server, callback) {
    const coll = this.collection;
    const query = this.query;
    const sort = formattedOrderClause(this.sort);
    const doc = this.doc;
    const options = this.options;

    // Create findAndModify command object
    const command = {
      findAndModify: coll.collectionName,
      query: query
    };

    if (sort) {
      command.sort = sort;
    }

    command.new = options.new ? true : false;
    command.remove = options.remove ? true : false;
    command.upsert = options.upsert ? true : false;

    const projection = options.projection || options.fields;
    if (projection) {
      command.fields = projection;
    }

    if (options.arrayFilters) {
      command.arrayFilters = options.arrayFilters;
    }

    if (doc && !options.remove) {
      command.update = doc;
    }

    if (options.maxTimeMS) {
      command.maxTimeMS = options.maxTimeMS;
    }

    // Decorate the findAndModify command with the write Concern
    if (options.writeConcern) {
      command.writeConcern = options.writeConcern;
    }

    // Have we specified bypassDocumentValidation
    if (options.bypassDocumentValidation === true) {
      command.bypassDocumentValidation = options.bypassDocumentValidation;
    }

    return super.executeCommand(server, command, callback);
  }
}

defineAspects(FindAndModifyOperation, [
  Aspect.WRITE_OPERATION,
  Aspect.READ_OPERATION,
  Aspect.EXECUTE_WITH_SELECTION
]);

module.exports = FindAndModifyOperation;
