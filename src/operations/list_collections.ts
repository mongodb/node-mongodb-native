import { CommandOperation, CommandOperationOptions } from './command';
import { Aspect, defineAspects } from './operation';
import { maxWireVersion, Callback } from '../utils';
import * as CONSTANTS from '../constants';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { Db } from '../db';
import type { DocumentTransforms } from '../cursor/core_cursor';

const LIST_COLLECTIONS_WIRE_VERSION = 3;

function listCollectionsTransforms(databaseName: string): DocumentTransforms {
  const matching = `${databaseName}.`;

  return {
    doc(doc) {
      const index = doc.name.indexOf(matching);
      // Remove database name if available
      if (doc.name && index === 0) {
        doc.name = doc.name.substr(index + matching.length);
      }

      return doc;
    }
  };
}

/** @public */
export interface ListCollectionsOptions extends CommandOperationOptions {
  /** Since 4.0: If true, will only return the collection name in the response, and will omit additional info */
  nameOnly?: boolean;
  /** The batchSize for the returned command cursor or if pre 2.8 the systems batch collection */
  batchSize?: number;
}

/** @internal */
export class ListCollectionsOperation extends CommandOperation<ListCollectionsOptions, string[]> {
  db: Db;
  filter: Document;
  nameOnly: boolean;
  batchSize?: number;

  constructor(db: Db, filter: Document, options: ListCollectionsOptions) {
    super(db, options);

    this.db = db;
    this.filter = filter;
    this.nameOnly = !!this.options.nameOnly;

    if (typeof this.options.batchSize === 'number') {
      this.batchSize = this.options.batchSize;
    }
  }

  execute(server: Server, callback: Callback<string[]>): void {
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
        filter = { name: `/${databaseName}/` };
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
          if (result && result.documents && Array.isArray(result.documents)) {
            result.documents = result.documents.map(transforms.doc);
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

defineAspects(ListCollectionsOperation, [Aspect.READ_OPERATION, Aspect.RETRYABLE]);
