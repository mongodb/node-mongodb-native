'use strict';

const {
  BSON: { Code }
} = require('../deps');
const { executeCommand } = require('./db_ops');
const { loadDb } = require('../dynamic_loaders');
const { OperationBase } = require('./operation');
const {
  applyWriteConcern,
  decorateWithCollation,
  decorateWithReadConcern,
  handleCallback,
  isObject,
  resolveReadPreference,
  toError
} = require('../utils');

// type imports
/** @typedef {import('../collection').Collection} Collection */

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

/**
 * Run Map Reduce across a collection. Be aware that the inline option for out will return an array of results not a collection.
 *
 * @class
 * @property {Collection} collection Collection instance.
 * @property {(Function|string)} map The mapping function.
 * @property {(Function|string)} reduce The reduce function.
 * @property {object} [options] Optional settings. See Collection.prototype.mapReduce for a list of options.
 */
class MapReduceOperation extends OperationBase {
  /**
   * Constructs a MapReduce operation.
   *
   * @param {Collection} collection Collection instance.
   * @param {(Function|string)} map The mapping function.
   * @param {(Function|string)} reduce The reduce function.
   * @param {object} [options] Optional settings. See Collection.prototype.mapReduce for a list of options.
   */
  constructor(collection, map, reduce, options) {
    super(options);

    this.collection = collection;
    this.map = map;
    this.reduce = reduce;
  }

  /**
   * Execute the operation.
   *
   * @param {Collection~resultCallback} [callback] The command result callback
   */
  execute(callback) {
    const coll = this.collection;
    const map = this.map;
    const reduce = this.reduce;
    let options = this.options;

    const mapCommandHash = {
      mapReduce: coll.collectionName,
      map: map,
      reduce: reduce
    };

    if (options.scope) {
      mapCommandHash.scope = processScope(options.scope);
    }

    // Add any other options passed in
    for (let n in options) {
      // Only include if not in exclusion list
      if (exclusionList.indexOf(n) === -1) {
        mapCommandHash[n] = options[n];
      }
    }

    options = Object.assign({}, options);

    // Ensure we have the right read preference inheritance
    options.readPreference = resolveReadPreference(coll, options);

    // If we have a read preference and inline is not set as output fail hard
    if (
      options.readPreference !== false &&
      options.readPreference !== 'primary' &&
      options['out'] &&
      options['out'].inline !== 1 &&
      options['out'] !== 'inline'
    ) {
      // Force readPreference to primary
      options.readPreference = 'primary';
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
    executeCommand(coll.s.db, mapCommandHash, options, (err, result) => {
      if (err) return handleCallback(callback, err);
      // Check if we have an error
      if (1 !== result.ok || result.err || result.errmsg) {
        return handleCallback(callback, toError(result));
      }

      // Create statistics value
      const stats = {};
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
function processScope(scope) {
  if (!isObject(scope) || scope._bsontype === 'ObjectID') {
    return scope;
  }

  const newScope = {};

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

module.exports = MapReduceOperation;
