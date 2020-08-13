import { Code } from '../bson';
import { loadDb } from '../dynamic_loaders';
import {
  applyWriteConcern,
  decorateWithCollation,
  decorateWithReadConcern,
  isObject
} from '../utils';
import { ReadPreference, ReadPreferenceMode } from '../read_preference';
import { CommandOperation, CommandOperationOptions } from './command';
import { defineAspects, Aspect } from './operation';
import type { Callback, Document } from '../types';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { Sort } from './find';
import { MongoError } from '../error';

const exclusionList = [
  'readPreference',
  'session',
  'bypassDocumentValidation',
  'w',
  'wtimeout',
  'j',
  'writeConcern',
  'scope' // this option is reformatted thus exclude the original
];

export type MapFunction = () => void;
export type ReduceFunction = (key: string, values: Document[]) => Document;
export type FinalizeFunction = (key: string, reducedValue: Document) => Document;

export interface MapReduceOptions extends CommandOperationOptions {
  /** Sets the output target for the map reduce job. *{inline:1} | {replace:'collectionName'} | {merge:'collectionName'} | {reduce:'collectionName'}* */
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
  /** It is possible to make the execution stay in JS. Provided in MongoDB > 2.0.X. */
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
 *
 * @class
 * @property {Collection} collection Collection instance.
 * @property {(Function|string)} map The mapping function.
 * @property {(Function|string)} reduce The reduce function.
 * @property {object} [options] Optional settings. See Collection.prototype.mapReduce for a list of options.
 */
export class MapReduceOperation extends CommandOperation<MapReduceOptions> {
  collection: Collection;
  map: MapFunction | string;
  reduce: ReduceFunction | string;

  /**
   * Constructs a MapReduce operation.
   *
   * @param {Collection} collection Collection instance.
   * @param {(Function|string)} map The mapping function.
   * @param {(Function|string)} reduce The reduce function.
   * @param {object} [options] Optional settings. See Collection.prototype.mapReduce for a list of options.
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

    // Ensure we have the right read preference inheritance
    options.readPreference = ReadPreference.resolve(coll, options);

    // If we have a read preference and inline is not set as output fail hard
    if (
      options.readPreference &&
      options.readPreference.mode === ReadPreferenceMode.primary &&
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
        const Db = loadDb();
        collection = new Db(doc.db, coll.s.db.s.topology, coll.s.db.s.options).collection(
          doc.collection
        );
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
function processScope(scope: Document) {
  if (!isObject(scope) || scope._bsontype === 'ObjectID') {
    return scope;
  }

  const newScope: Document = {};

  for (const key of Object.keys(scope)) {
    if ('function' === typeof scope[key]) {
      newScope[key] = new Code(String(scope[key]));
    } else if (scope[key]._bsontype === 'Code') {
      newScope[key] = scope[key];
    } else {
      newScope[key] = processScope(scope[key]);
    }
  }

  return newScope;
}

defineAspects(MapReduceOperation, [Aspect.EXECUTE_WITH_SELECTION]);
