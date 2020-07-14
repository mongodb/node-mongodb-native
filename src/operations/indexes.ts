import { indexInformation } from './common_functions';
import { OperationBase, Aspect, defineAspects } from './operation';
import { MongoError } from '../error';
import { maxWireVersion, parseIndexOptions, handleCallback } from '../utils';
import CommandOperation = require('./command');
import ReadPreference = require('../read_preference');

/* eslint-disable */
import type { Server } from '../sdam/server';
/* eslint-enable */

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

function makeIndexSpec(indexOrSpec: any, options: any) {
  const indexParameters = parseIndexOptions(indexOrSpec);

  // Generate the index name
  const name = typeof options.name === 'string' ? options.name : indexParameters.name;

  // Set up the index
  const indexSpec: any = { name, key: indexParameters.fieldHash };

  // merge valid index options into the index spec
  for (let optionName in options) {
    if (VALID_INDEX_OPTIONS.has(optionName)) {
      indexSpec[optionName] = options[optionName];
    }
  }

  return indexSpec;
}

class IndexesOperation extends OperationBase {
  collection: any;

  constructor(collection: any, options: any) {
    super(options);

    this.collection = collection;
  }

  execute(callback: Function) {
    const coll = this.collection;
    let options = this.options;

    options = Object.assign({}, { full: true }, options);
    indexInformation(coll.s.db, coll.collectionName, options, callback);
  }
}

class CreateIndexesOperation extends CommandOperation {
  collectionName: string;
  onlyReturnNameOfCreatedIndex?: boolean;
  indexes: any;

  constructor(parent: any, collectionName: string, indexes: any[], options: any) {
    super(parent, options);
    this.collectionName = collectionName;

    this.indexes = indexes;
    if (indexes.length === 1) {
      this.onlyReturnNameOfCreatedIndex = true;
    }
  }

  execute(server: any, callback: Function) {
    const options = this.options;
    const indexes = this.indexes;

    const serverWireVersion = maxWireVersion(server);

    // Ensure we generate the correct name if the parameter is not set
    for (let i = 0; i < indexes.length; i++) {
      // Did the user pass in a collation, check if our write server supports it
      if (indexes[i].collation && serverWireVersion < 5) {
        callback(
          new MongoError(
            `Server ${server.name}, which reports wire version ${serverWireVersion}, does not support collation`
          )
        );
        return;
      }

      if (indexes[i].name == null) {
        const keys = [];

        for (let name in indexes[i].key) {
          keys.push(`${name}_${indexes[i].key[name]}`);
        }

        // Set the name
        indexes[i].name = keys.join('_');
      }
    }

    const cmd = { createIndexes: this.collectionName, indexes } as any;

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

    super.executeCommand(server, cmd, (err?: any, result?: any) => {
      if (err) {
        callback(err);
        return;
      }

      callback(null, this.onlyReturnNameOfCreatedIndex ? indexes[0].name : result);
    });
  }
}

class CreateIndexOperation extends CreateIndexesOperation {
  constructor(parent: any, collectionName: string, indexOrSpec: any, options: any) {
    // createIndex can be called with a variety of styles:
    //   coll.createIndex('a');
    //   coll.createIndex({ a: 1 });
    //   coll.createIndex([['a', 1]]);
    // createIndexes is always called with an array of index spec objects

    super(parent, collectionName, [makeIndexSpec(indexOrSpec, options)], options);
  }
}

class EnsureIndexOperation extends CreateIndexOperation {
  db: any;
  collectionName: string;

  constructor(db: any, collectionName: string, fieldOrSpec: any, options?: object) {
    super(db, collectionName, fieldOrSpec, options);

    this.readPreference = ReadPreference.primary;
    this.db = db;
    this.collectionName = collectionName;
  }

  execute(server: Server, callback: Function) {
    const indexName = this.indexes[0].name;
    const cursor = this.db.collection(this.collectionName).listIndexes();
    cursor.toArray((err: MongoError, indexes: any) => {
      /// ignore "NamespaceNotFound" errors
      if (err && err.code !== 26) {
        return callback(err);
      }

      if (indexes) {
        indexes = Array.isArray(indexes) ? indexes : [indexes];
        if (indexes.some((index: any) => index.name === indexName)) {
          callback(null, indexName);
          return;
        }
      }

      super.execute(server, callback);
    });
  }
}

class DropIndexOperation extends CommandOperation {
  collection: any;
  indexName: any;

  constructor(collection: any, indexName: any, options: any) {
    super(collection, options);
    this.collection = collection;
    this.indexName = indexName;
  }

  execute(server: any, callback: Function) {
    const cmd = { dropIndexes: this.collection.collectionName, index: this.indexName };
    super.executeCommand(server, cmd, (err?: any, result?: any) => {
      if (typeof callback !== 'function') return;
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, null, result);
    });
  }
}

class DropIndexesOperation extends DropIndexOperation {
  constructor(collection: any, options: any) {
    super(collection, '*', options);
  }

  execute(server: any, callback: Function) {
    super.execute(server, (err: any) => {
      if (err) return handleCallback(callback, err, false);
      handleCallback(callback, null, true);
    });
  }
}

class ListIndexesOperation extends CommandOperation {
  collectionNamespace: any;

  constructor(collection: any, options: any) {
    super(collection, options, { fullResponse: true });

    this.collectionNamespace = collection.s.namespace;
  }

  execute(server: any, callback: Function) {
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

class IndexExistsOperation extends OperationBase {
  collection: any;
  indexes: any;

  constructor(collection: any, indexes: any, options: any) {
    super(options);

    this.collection = collection;
    this.indexes = indexes;
  }

  execute(callback: Function) {
    const coll = this.collection;
    const indexes = this.indexes;
    const options = this.options;

    indexInformation(
      coll.s.db,
      coll.collectionName,
      options,
      (err?: any, indexInformation?: any) => {
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
      }
    );
  }
}

class IndexInformationOperation extends OperationBase {
  db: any;
  name: any;

  constructor(db: any, name: any, options: any) {
    super(options);

    this.db = db;
    this.name = name;
  }

  execute(callback: Function) {
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
export {
  IndexesOperation,
  CreateIndexesOperation,
  CreateIndexOperation,
  DropIndexOperation,
  DropIndexesOperation,
  EnsureIndexOperation,
  IndexExistsOperation,
  IndexInformationOperation,
  ListIndexesOperation
};
