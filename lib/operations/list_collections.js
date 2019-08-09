'use strict';

const CommandOperationV2 = require('./command_v2');
const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const maxWireVersion = require('../core/utils').maxWireVersion;
const CONSTANTS = require('../constants');

const LIST_COLLECTIONS_WIRE_VERSION = 3;

function listCollectionsTransforms(databaseName) {
  const matching = `${databaseName}.`;

  return {
    doc: doc => {
      const index = doc.name.indexOf(matching);
      // Remove database name if available
      if (doc.name && index === 0) {
        doc.name = doc.name.substr(index + matching.length);
      }

      return doc;
    }
  };
}

class ListCollectionsOperation extends CommandOperationV2 {
  constructor(db, filter, options) {
    super(db, options, { fullResponse: true });

    this.db = db;
    this.filter = filter;
    this.nameOnly = !!this.options.nameOnly;

    if (typeof this.options.batchSize === 'number') {
      this.batchSize = this.options.batchSize;
    }
  }

  execute(server, callback) {
    if (maxWireVersion(server) < LIST_COLLECTIONS_WIRE_VERSION) {
      let filter = this.filter;
      const databaseName = this.db.s.namespace.db;

      // If we have legacy mode and have not provided a full db name filter it
      if (
        typeof filter.name === 'string' &&
        !new RegExp('^' + databaseName + '\\.').test(filter.name)
      ) {
        filter = Object.assign({}, filter);
        filter.name = this.db.s.namespace.withCollection(filter.name).toString();
      }

      // No filter, filter by current database
      if (filter == null) {
        filter.name = `/${databaseName}/`;
      }

      // Rewrite the filter to use $and to filter out indexes
      if (filter.name) {
        filter = { $and: [{ name: filter.name }, { name: /^((?!\$).)*$/ }] };
      } else {
        filter = { name: /^((?!\$).)*$/ };
      }

      const transforms = listCollectionsTransforms(databaseName);
      server.query(
        `${databaseName}.${CONSTANTS.SYSTEM_NAMESPACE_COLLECTION}`,
        { query: filter },
        { batchSize: this.batchSize || 1000 },
        {},
        (err, result) => {
          if (
            result &&
            result.message &&
            result.message.documents &&
            Array.isArray(result.message.documents)
          ) {
            result.message.documents = result.message.documents.map(transforms.doc);
          }

          callback(err, result);
        }
      );

      return;
    }

    const command = {
      listCollections: 1,
      filter: this.filter,
      cursor: this.batchSize ? { batchSize: this.batchSize } : {},
      nameOnly: this.nameOnly
    };

    return super.executeCommand(server, command, callback);
  }
}

defineAspects(ListCollectionsOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION
]);

module.exports = ListCollectionsOperation;
