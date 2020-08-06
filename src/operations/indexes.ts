import { indexInformation, IndexInformationOptions } from './common_functions';
import { OperationBase, Aspect, defineAspects, OperationOptions } from './operation';
import { MongoError } from '../error';
import { maxWireVersion, parseIndexOptions, handleCallback, MongoDBNamespace } from '../utils';
import { CommandOperation, CommandOpOptions } from './command';
import { ReadPreference } from '../read_preference';

import type { Server } from '../sdam/server';
import type { Callback, Document } from '../types';
import type { Collection } from '../collection';
import type { Db } from '../db';
import type { CollationOptions } from '../cmap/wire_protocol/write_command';

const LIST_INDEXES_WIRE_VERSION = 3;
const VALID_INDEX_OPTIONS = new Set([
  'background',
  'unique',
  'name',
  'partialFilterExpression',
  'sparse',
  'expireAfterSeconds',
  'storageEngine',
  'collation',

  // text indexes
  'weights',
  'default_language',
  'language_override',
  'textIndexVersion',

  // 2d-sphere indexes
  '2dsphereIndexVersion',

  // 2d indexes
  'bits',
  'min',
  'max',

  // geoHaystack Indexes
  'bucketSize',

  // wildcard indexes
  'wildcardProjection'
]);

export interface IndexOptions {
  background: boolean;
  unique: boolean;
  name: string;
  partialFilterExpression: Document;
  sparse: boolean;
  expireAfterSeconds: number;
  storageEngine: Document;
  collation: CollationOptions;
  // text indexes
  weights: Document;
  default_language: string;
  language_override: string;
  textIndexVersion: number;
  // 2d-sphere indexes
  '2dsphereIndexVersion': number;
  // 2d indexes
  bits: number;
  min: number;
  max: number;
  // geoHaystack Indexes
  bucketSize: number;
  // wildcard indexes
  wildcardProjection: Document;
}

function makeIndexSpec(indexOrSpec: any, options: any): IndexDescription {
  const indexParameters = parseIndexOptions(indexOrSpec);

  // Generate the index name
  const name = typeof options.name === 'string' ? options.name : indexParameters.name;

  // Set up the index
  const indexSpec: Document = { name, key: indexParameters.fieldHash };

  // merge valid index options into the index spec
  for (const optionName in options) {
    if (VALID_INDEX_OPTIONS.has(optionName)) {
      indexSpec[optionName] = options[optionName];
    }
  }

  return indexSpec as IndexDescription;
}

export class IndexesOperation extends OperationBase {
  collection: Collection;

  constructor(collection: Collection, options: OperationOptions) {
    super(options);

    this.collection = collection;
  }

  execute(callback: Callback): void {
    const coll = this.collection;
    let options = this.options;

    options = Object.assign({}, { full: true }, options);
    indexInformation(coll.s.db, coll.collectionName, options, callback);
  }
}

export interface IndexDescription {
  collation: CollationOptions;
  name: string;
  key: Document;
}

export class CreateIndexesOperation extends CommandOperation {
  collectionName: string;
  onlyReturnNameOfCreatedIndex?: boolean;
  indexes: IndexDescription[];

  constructor(
    parent: Collection | Db,
    collectionName: string,
    indexes: IndexDescription[],
    options: CommandOpOptions
  ) {
    super(parent, options);
    this.collectionName = collectionName;

    this.indexes = indexes;
    if (indexes.length === 1) {
      this.onlyReturnNameOfCreatedIndex = true;
    }
  }

  execute(server: Server, callback: Callback): void {
    const options = this.options;
    const indexes = this.indexes;

    const serverWireVersion = maxWireVersion(server);

    // Ensure we generate the correct name if the parameter is not set
    for (let i = 0; i < indexes.length; i++) {
      // Did the user pass in a collation, check if our write server supports it
      if (indexes[i].collation && serverWireVersion < 5) {
        callback(
          new MongoError(
            `Server ${server.name}, which reports wire version ${serverWireVersion}, ` +
              'does not support collation'
          )
        );
        return;
      }

      if (indexes[i].name == null) {
        const keys = [];

        for (const name in indexes[i].key) {
          keys.push(`${name}_${indexes[i].key[name]}`);
        }

        // Set the name
        indexes[i].name = keys.join('_');
      }
    }

    const cmd: Document = { createIndexes: this.collectionName, indexes };

    if (options.commitQuorum != null) {
      if (serverWireVersion < 9) {
        callback(
          new MongoError('`commitQuorum` option for `createIndexes` not supported on servers < 4.4')
        );
        return;
      }
      cmd.commitQuorum = options.commitQuorum;
    }

    // collation is set on each index, it should not be defined at the root
    this.options.collation = undefined;

    super.executeCommand(server, cmd, (err, result) => {
      if (err) {
        callback(err);
        return;
      }

      callback(undefined, this.onlyReturnNameOfCreatedIndex ? indexes[0].name : result);
    });
  }
}

export class CreateIndexOperation extends CreateIndexesOperation {
  constructor(parent: Collection | Db, collectionName: string, indexOrSpec: any, options: any) {
    // createIndex can be called with a variety of styles:
    //   coll.createIndex('a');
    //   coll.createIndex({ a: 1 });
    //   coll.createIndex([['a', 1]]);
    // createIndexes is always called with an array of index spec objects

    super(parent, collectionName, [makeIndexSpec(indexOrSpec, options)], options);
  }
}

export class EnsureIndexOperation extends CreateIndexOperation {
  db: Db;
  collectionName: string;

  constructor(db: Db, collectionName: string, fieldOrSpec: any, options?: object) {
    super(db, collectionName, fieldOrSpec, options);

    this.readPreference = ReadPreference.primary;
    this.db = db;
    this.collectionName = collectionName;
  }

  execute(server: Server, callback: Callback): void {
    const indexName = this.indexes[0].name;
    const cursor = this.db.collection(this.collectionName).listIndexes();
    cursor.toArray((err, indexes) => {
      /// ignore "NamespaceNotFound" errors
      if (err && (err as MongoError).code !== 26) {
        return callback(err);
      }

      if (indexes) {
        indexes = Array.isArray(indexes) ? indexes : [indexes];
        if (indexes.some(index => index.name === indexName)) {
          callback(undefined, indexName);
          return;
        }
      }

      super.execute(server, callback);
    });
  }
}

export class DropIndexOperation extends CommandOperation {
  collection: Collection;
  indexName: string;

  constructor(collection: Collection, indexName: string, options: any) {
    super(collection, options);
    this.collection = collection;
    this.indexName = indexName;
  }

  execute(server: Server, callback: Callback): void {
    const cmd = { dropIndexes: this.collection.collectionName, index: this.indexName };
    super.executeCommand(server, cmd, (err, result) => {
      if (typeof callback !== 'function') return;
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, null, result);
    });
  }
}

export class DropIndexesOperation extends DropIndexOperation {
  constructor(collection: Collection, options: any) {
    super(collection, '*', options);
  }

  execute(server: Server, callback: Callback): void {
    super.execute(server, err => {
      if (err) return handleCallback(callback, err, false);
      handleCallback(callback, null, true);
    });
  }
}

export class ListIndexesOperation extends CommandOperation {
  collectionNamespace: MongoDBNamespace;

  constructor(collection: Collection, options: any) {
    super(collection, options, { fullResponse: true });

    this.collectionNamespace = collection.s.namespace;
  }

  execute(server: Server, callback: Callback): void {
    const serverWireVersion = maxWireVersion(server);
    if (serverWireVersion < LIST_INDEXES_WIRE_VERSION) {
      const systemIndexesNS = this.collectionNamespace.withCollection('system.indexes').toString();
      const collectionNS = this.collectionNamespace.toString();

      server.query(systemIndexesNS, { query: { ns: collectionNS } }, {}, this.options, callback);
      return;
    }

    const cursor = this.options.batchSize ? { batchSize: this.options.batchSize } : {};
    super.executeCommand(
      server,
      { listIndexes: this.collectionNamespace.collection, cursor },
      callback
    );
  }
}

export class IndexExistsOperation extends OperationBase {
  collection: Collection;
  indexes: string | string[];

  constructor(
    collection: Collection,
    indexes: string | string[],
    options: IndexInformationOptions
  ) {
    super(options);

    this.collection = collection;
    this.indexes = indexes;
  }

  execute(callback: Callback): void {
    const coll = this.collection;
    const indexes = this.indexes;
    const options = this.options;

    indexInformation(coll.s.db, coll.collectionName, options, (err, indexInformation) => {
      // If we have an error return
      if (err != null) return handleCallback(callback, err, null);
      // Let's check for the index names
      if (!Array.isArray(indexes))
        return handleCallback(callback, null, indexInformation[indexes] != null);
      // Check in list of indexes
      for (let i = 0; i < indexes.length; i++) {
        if (indexInformation[indexes[i]] == null) {
          return handleCallback(callback, null, false);
        }
      }

      // All keys found return true
      return handleCallback(callback, null, true);
    });
  }
}

export class IndexInformationOperation extends OperationBase {
  db: Db;
  name: string;

  constructor(db: Db, name: string, options: IndexInformationOptions) {
    super(options);

    this.db = db;
    this.name = name;
  }

  execute(callback: Callback): void {
    const db = this.db;
    const name = this.name;
    const options = this.options;

    indexInformation(db, name, options, callback);
  }
}

defineAspects(ListIndexesOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION
]);

defineAspects(CreateIndexesOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
defineAspects(CreateIndexOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
defineAspects(EnsureIndexOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
defineAspects(DropIndexOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
defineAspects(DropIndexesOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
