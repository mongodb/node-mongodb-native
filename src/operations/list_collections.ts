import { CommandOperation } from './command';
import { Aspect, defineAspects } from './operation';
import { maxWireVersion } from '../utils';
import * as CONSTANTS from '../constants';
import type { Callback, Document } from '../types';
import type { Server } from '../sdam/server';
import type { Db } from '../db';
import type { ReadPreference } from '..';
import type { ClientSession } from '../sessions';

const LIST_COLLECTIONS_WIRE_VERSION = 3;

interface CollectionTransform {
  doc(doc: Document): Document;
}

function listCollectionsTransforms(databaseName: string): CollectionTransform {
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

export interface ListCollectionOptions {
  /** Since 4.0: If true, will only return the collection name in the response, and will omit additional info */
  nameOnly?: boolean;
  /** The batchSize for the returned command cursor or if pre 2.8 the systems batch collection */
  batchSize?: number;
  /** The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST). */
  readPreference?: ReadPreference;
  /** optional session to use for this operation */
  session?: ClientSession;
}

export class ListCollectionsOperation extends CommandOperation {
  db: Db;
  filter: Document;
  nameOnly: boolean;
  batchSize?: number;

  constructor(db: Db, filter: Document, options: ListCollectionOptions) {
    super(db, options, { fullResponse: true });

    this.db = db;
    this.filter = filter;
    this.nameOnly = !!this.options.nameOnly;

    if (typeof this.options.batchSize === 'number') {
      this.batchSize = this.options.batchSize;
    }
  }

  execute(server: Server, callback: Callback): void {
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
      if (filter.name == null) {
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
