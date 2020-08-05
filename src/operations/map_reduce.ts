import type { WriteConcernOptions } from './../collection';
import { Code } from '../bson';
import { loadDb } from '../dynamic_loaders';
import {
  applyWriteConcern,
  decorateWithCollation,
  decorateWithReadConcern,
  handleCallback,
  isObject,
  toError
} from '../utils';
import { ReadPreference } from '../read_preference';
import { CommandOperation, CommandOperationOptions } from './command';
import { defineAspects, Aspect } from './operation';

interface MapReduceOperationOptions extends CommandOperationOptions, WriteConcernOptions {
  bypassDocumentValidation?: boolean;
  verbose?: boolean;
  scope?: any;
  out?: boolean | 'inline' | { inline: number };
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
class MapReduceOperation extends CommandOperation<MapReduceOperationOptions> {
  collection: any;
  map: any;
  reduce: any;

  /**
   * Constructs a MapReduce operation.
   *
   * @param {Collection} collection Collection instance.
   * @param {(Function|string)} map The mapping function.
   * @param {(Function|string)} reduce The reduce function.
   * @param {object} [options] Optional settings. See Collection.prototype.mapReduce for a list of options.
   */
  constructor(collection: any, map: any, reduce: any, options?: object) {
    super(collection, options);

    this.collection = collection;
    this.map = map;
    this.reduce = reduce;
  }

  get inline() {
    const { options } = this;
    return Boolean(
      (typeof options['out'] === 'boolean' && options['out']) ||
        (typeof options['out'] === 'string' && options['out'] === 'inline') ||
        (options['out'] && options['out'].inline && options['out'].inline === 1)
    );
  }

  execute(server: any, callback: Function) {
    const coll = this.collection;
    const map = this.map;
    const reduce = this.reduce;
    let options = this.options;

    const mapCommandHash = {
      mapReduce: coll.collectionName,
      map: map,
      reduce: reduce,
      scope: options.scope ? processScope(options.scope) : undefined,
      ...options
    };
    delete mapCommandHash.readPreference;
    delete mapCommandHash.session;
    delete mapCommandHash.bypassDocumentValidation;
    delete mapCommandHash.w;
    delete mapCommandHash.wtimeout;
    delete mapCommandHash.j;

    // If we have a read preference and inline is not set as output fail hard
    if (this.readPreference.mode !== 'primary' && !this.inline) {
      // Force readPreference to primary
      this.readPreference = ReadPreference.primary;
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
      return callback(err, null);
    }

    // Execute command
    super.executeCommand(server, mapCommandHash, (err?: any, result?: any) => {
      if (err) return handleCallback(callback, err);
      // Check if we have an error
      if (1 !== result.ok || result.err || result.errmsg) {
        return handleCallback(callback, toError(result));
      }

      // Create statistics value
      const stats: any = {};
      if (result.timeMillis) stats['processtime'] = result.timeMillis;
      if (result.counts) stats['counts'] = result.counts;
      if (result.timing) stats['timing'] = result.timing;

      // invoked with inline?
      if (result.results) {
        // If we wish for no verbosity
        if (options['verbose'] == null || !options['verbose']) {
          return handleCallback(callback, null, result.results);
        }

        return handleCallback(callback, null, { results: result.results, stats: stats });
      }

      // The returned collection
      let collection = null;

      // If we have an object it's a different db
      if (result.result != null && typeof result.result === 'object') {
        const doc = result.result;
        // Return a collection from another db
        let Db = loadDb();
        collection = new Db(doc.db, coll.s.db.s.topology, coll.s.db.s.options).collection(
          doc.collection
        );
      } else {
        // Create a collection object that wraps the result collection
        collection = coll.s.db.collection(result.result);
      }

      // If we wish for no verbosity
      if (options['verbose'] == null || !options['verbose']) {
        return handleCallback(callback, err, collection);
      }

      // Return stats as third set of values
      handleCallback(callback, err, { collection: collection, stats: stats });
    });
  }
}

/**
 * Functions that are passed as scope args must
 * be converted to Code instances.
 *
 * @param {any} scope
 */
function processScope(scope: any) {
  if (!isObject(scope) || scope._bsontype === 'ObjectID') {
    return scope;
  }

  const newScope: any = {};

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
export = MapReduceOperation;
