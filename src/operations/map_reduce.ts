import type { ObjectId } from '../bson';
import { Code, Document } from '../bson';
import type { Collection } from '../collection';
import { MongoCompatibilityError, MongoServerError } from '../error';
import { ReadPreference, ReadPreferenceMode } from '../read_preference';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import type { Sort } from '../sort';
import {
  applyWriteConcern,
  Callback,
  decorateWithCollation,
  decorateWithReadConcern,
  isObject,
  maxWireVersion
} from '../utils';
import { CommandOperation, CommandOperationOptions } from './command';
import { Aspect, defineAspects } from './operation';

const exclusionList = [
  'explain',
  'readPreference',
  'readConcern',
  'session',
  'bypassDocumentValidation',
  'writeConcern',
  'raw',
  'fieldsAsRaw',
  'promoteLongs',
  'promoteValues',
  'promoteBuffers',
  'bsonRegExp',
  'serializeFunctions',
  'ignoreUndefined',
  'enableUtf8Validation',
  'scope' // this option is reformatted thus exclude the original
];

/** @public */
export type MapFunction<TSchema = Document> = (this: TSchema) => void;
/** @public */
export type ReduceFunction<TKey = ObjectId, TValue = any> = (key: TKey, values: TValue[]) => TValue;
/** @public */
export type FinalizeFunction<TKey = ObjectId, TValue = Document> = (
  key: TKey,
  reducedValue: TValue
) => TValue;

/** @public */
export interface MapReduceOptions<TKey = ObjectId, TValue = Document>
  extends CommandOperationOptions {
  /** Sets the output target for the map reduce job. */
  out?: 'inline' | { inline: 1 } | { replace: string } | { merge: string } | { reduce: string };
  /** Query filter object. */
  query?: Document;
  /** Sorts the input objects using this key. Useful for optimization, like sorting by the emit key for fewer reduces. */
  sort?: Sort;
  /** Number of objects to return from collection. */
  limit?: number;
  /** Keep temporary data. */
  keeptemp?: boolean;
  /** Finalize function. */
  finalize?: FinalizeFunction<TKey, TValue> | string;
  /** Can pass in variables that can be access from map/reduce/finalize. */
  scope?: Document;
  /** It is possible to make the execution stay in JS. Provided in MongoDB \> 2.0.X. */
  jsMode?: boolean;
  /** Provide statistics on job execution time. */
  verbose?: boolean;
  /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
  bypassDocumentValidation?: boolean;
}

interface MapReduceStats {
  processtime?: number;
  counts?: number;
  timing?: number;
}

/**
 * Run Map Reduce across a collection. Be aware that the inline option for out will return an array of results not a collection.
 * @internal
 */
export class MapReduceOperation extends CommandOperation<Document | Document[]> {
  override options: MapReduceOptions;
  collection: Collection;
  /** The mapping function. */
  map: MapFunction | string;
  /** The reduce function. */
  reduce: ReduceFunction | string;

  /**
   * Constructs a MapReduce operation.
   *
   * @param collection - Collection instance.
   * @param map - The mapping function.
   * @param reduce - The reduce function.
   * @param options - Optional settings. See Collection.prototype.mapReduce for a list of options.
   */
  constructor(
    collection: Collection,
    map: MapFunction | string,
    reduce: ReduceFunction | string,
    options?: MapReduceOptions
  ) {
    super(collection, options);

    this.options = options ?? {};
    this.collection = collection;
    this.map = map;
    this.reduce = reduce;
  }

  override execute(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<Document | Document[]>
  ): void {
    const coll = this.collection;
    const map = this.map;
    const reduce = this.reduce;
    let options = this.options;

    const mapCommandHash: Document = {
      mapReduce: coll.collectionName,
      map: map,
      reduce: reduce
    };

    if (options.scope) {
      mapCommandHash.scope = processScope(options.scope);
    }

    // Add any other options passed in
    for (const n in options) {
      // Only include if not in exclusion list
      if (exclusionList.indexOf(n) === -1) {
        mapCommandHash[n] = (options as any)[n];
      }
    }

    options = Object.assign({}, options);

    // If we have a read preference and inline is not set as output fail hard
    if (
      this.readPreference.mode === ReadPreferenceMode.primary &&
      options.out &&
      (options.out as any).inline !== 1 &&
      options.out !== 'inline'
    ) {
      // Force readPreference to primary
      options.readPreference = ReadPreference.primary;
      // Decorate command with writeConcern if supported
      applyWriteConcern(mapCommandHash, { db: coll.s.db, collection: coll }, options);
    } else {
      decorateWithReadConcern(mapCommandHash, coll, options);
    }

    // Is bypassDocumentValidation specified
    if (options.bypassDocumentValidation === true) {
      mapCommandHash.bypassDocumentValidation = options.bypassDocumentValidation;
    }

    // Have we specified collation
    try {
      decorateWithCollation(mapCommandHash, coll, options);
    } catch (err) {
      return callback(err);
    }

    if (this.explain && maxWireVersion(server) < 9) {
      callback(
        new MongoCompatibilityError(`Server ${server.name} does not support explain on mapReduce`)
      );
      return;
    }

    // Execute command
    super.executeCommand(server, session, mapCommandHash, (err, result) => {
      if (err) return callback(err);
      // Check if we have an error
      if (1 !== result.ok || result.err || result.errmsg) {
        return callback(new MongoServerError(result));
      }

      // If an explain option was executed, don't process the server results
      if (this.explain) return callback(undefined, result);

      // Create statistics value
      const stats: MapReduceStats = {};
      if (result.timeMillis) stats['processtime'] = result.timeMillis;
      if (result.counts) stats['counts'] = result.counts;
      if (result.timing) stats['timing'] = result.timing;

      // invoked with inline?
      if (result.results) {
        // If we wish for no verbosity
        if (options['verbose'] == null || !options['verbose']) {
          return callback(undefined, result.results);
        }

        return callback(undefined, { results: result.results, stats: stats });
      }

      // The returned collection
      let collection = null;

      // If we have an object it's a different db
      if (result.result != null && typeof result.result === 'object') {
        const doc = result.result;
        // Return a collection from another db
        collection = coll.s.db.s.client.db(doc.db, coll.s.db.s.options).collection(doc.collection);
      } else {
        // Create a collection object that wraps the result collection
        collection = coll.s.db.collection(result.result);
      }

      // If we wish for no verbosity
      if (options['verbose'] == null || !options['verbose']) {
        return callback(err, collection);
      }

      // Return stats as third set of values
      callback(err, { collection, stats });
    });
  }
}

/** Functions that are passed as scope args must be converted to Code instances. */
function processScope(scope: Document | ObjectId) {
  if (!isObject(scope) || (scope as any)._bsontype === 'ObjectID') {
    return scope;
  }

  const newScope: Document = {};

  for (const key of Object.keys(scope)) {
    if ('function' === typeof (scope as Document)[key]) {
      newScope[key] = new Code(String((scope as Document)[key]));
    } else if ((scope as Document)[key]._bsontype === 'Code') {
      newScope[key] = (scope as Document)[key];
    } else {
      newScope[key] = processScope((scope as Document)[key]);
    }
  }

  return newScope;
}

defineAspects(MapReduceOperation, [Aspect.EXPLAINABLE]);
