import { Code, Document } from '../bson';
import { loadDb } from '../dynamic_loaders';
import {
  applyWriteConcern,
  decorateWithCollation,
  decorateWithReadConcern,
  isObject,
  Callback
} from '../utils';
import { ReadPreference, ReadPreferenceMode } from '../read_preference';
import { CommandOperation, CommandOperationOptions } from './command';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { Sort } from './find';
import { MongoError } from '../error';
import type { ObjectId } from '../bson';

const OPTIONS_ALLOW_LIST = new Set([
  'out',
  'query',
  'sort',
  'limit',
  'finalize',
  'jsMode',
  'verbose'
  // 'scope', // this option is reformatted thus exclude the original
  // 'bypassDocumentValidation'  // this option is only set if explicitly 'true'
]);

/** @public */
export type MapFunction = () => void;
/** @public */
export type ReduceFunction = (key: string, values: Document[]) => Document;
/** @public */
export type FinalizeFunction = (key: string, reducedValue: Document) => Document;

/** @public */
export interface MapReduceOptions extends CommandOperationOptions {
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
  finalize?: FinalizeFunction | string;
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

/** @internal Run Map Reduce across a collection. Be aware that the inline option for out will return an array of results not a collection. */
export class MapReduceOperation
  extends CommandOperation<Document | Document[]>
  implements MapReduceOptions {
  collection: Collection;
  /** The mapping function. */
  map: MapFunction | string;
  /** The reduce function. */
  reduce: ReduceFunction | string;
  scope: any;
  out: MapReduceOptions['out'];
  bypassDocumentValidation?: boolean;
  verbose?: boolean;

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

    this.collection = collection;
    this.map = map;
    this.reduce = reduce;
  }

  execute(server: Server, callback: Callback<Document | Document[]>): void {
    const coll = this.collection;
    const map = this.map;
    const reduce = this.reduce;

    const mapCommandHash: Document = {
      mapReduce: coll.collectionName,
      map: map,
      reduce: reduce
    };

    if (this.scope) {
      mapCommandHash.scope = processScope(this.scope);
    }

    // Add any other options passed in
    for (const n in this) {
      // Only include if defined on this
      if (OPTIONS_ALLOW_LIST.has(n)) {
        mapCommandHash[n] = this[n];
      }
    }

    // Ensure we have the right read preference inheritance
    this.readPreference = ReadPreference.resolve(coll, this);

    // If we have a read preference and inline is not set as output fail hard
    if (
      this.readPreference &&
      this.readPreference.mode === ReadPreferenceMode.primary &&
      this.out &&
      (this.out as any).inline !== 1 &&
      this.out !== 'inline'
    ) {
      // Force readPreference to primary
      this.readPreference = ReadPreference.primary;
      // Decorate command with writeConcern if supported
      applyWriteConcern(mapCommandHash, { db: coll.s.db, collection: coll }, this);
    } else {
      decorateWithReadConcern(mapCommandHash, coll, this);
    }

    // Is bypassDocumentValidation specified
    if (this.bypassDocumentValidation === true) {
      mapCommandHash.bypassDocumentValidation = this.bypassDocumentValidation;
    }

    // Have we specified collation
    try {
      decorateWithCollation(mapCommandHash, coll, this);
    } catch (err) {
      return callback(err);
    }

    // Execute command
    super.executeCommand(server, mapCommandHash, (err, result) => {
      if (err) return callback(err);
      // Check if we have an error
      if (1 !== result.ok || result.err || result.errmsg) {
        return callback(new MongoError(result));
      }

      // Create statistics value
      const stats: MapReduceStats = {};
      if (result.timeMillis) stats['processtime'] = result.timeMillis;
      if (result.counts) stats['counts'] = result.counts;
      if (result.timing) stats['timing'] = result.timing;

      // invoked with inline?
      if (result.results) {
        // If we wish for no verbosity
        if (this.verbose == null || !this.verbose) {
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
        const Db = loadDb();
        collection = new Db(doc.db, coll.s.db.s.topology, coll.s.db.s.options).collection(
          doc.collection
        );
      } else {
        // Create a collection object that wraps the result collection
        collection = coll.s.db.collection(result.result);
      }

      // If we wish for no verbosity
      if (this.verbose == null || !this.verbose) {
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
