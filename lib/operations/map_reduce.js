'use strict';

const applyWriteConcern = require('../utils').applyWriteConcern;
const Code = require('../core').BSON.Code;
const decorateWithCollation = require('../utils').decorateWithCollation;
const decorateWithReadConcern = require('../utils').decorateWithReadConcern;
const executeCommand = require('./db_ops').executeCommand;
const handleCallback = require('../utils').handleCallback;
const isObject = require('../utils').isObject;
const loadDb = require('../dynamic_loaders').loadDb;
const OperationBase = require('./operation').OperationBase;
const resolveReadPreference = require('../utils').resolveReadPreference;
const toError = require('../utils').toError;

const exclusionList = [
  'readPreference',
  'session',
  'bypassDocumentValidation',
  'w',
  'wtimeout',
  'j',
  'writeConcern'
];

/**
 * Run Map Reduce across a collection. Be aware that the inline option for out will return an array of results not a collection.
 *
 * @class
 * @property {Collection} a Collection instance.
 * @property {(function|string)} map The mapping function.
 * @property {(function|string)} reduce The reduce function.
 * @property {object} [options] Optional settings. See Collection.prototype.mapReduce for a list of options.
 */
class MapReduceOperation extends OperationBase {
  /**
   * Constructs a MapReduce operation.
   *
   * @param {Collection} a Collection instance.
   * @param {(function|string)} map The mapping function.
   * @param {(function|string)} reduce The reduce function.
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
      mapreduce: coll.collectionName,
      map: map,
      reduce: reduce
    };

    // Add any other options passed in
    for (let n in options) {
      if ('scope' === n) {
        mapCommandHash[n] = processScope(options[n]);
      } else {
        // Only include if not in exclusion list
        if (exclusionList.indexOf(n) === -1) {
          mapCommandHash[n] = options[n];
        }
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
      (options['out'].inline !== 1 && options['out'] !== 'inline')
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
 * @ignore
 */
function processScope(scope) {
  if (!isObject(scope) || scope._bsontype === 'ObjectID') {
    return scope;
  }

  const keys = Object.keys(scope);
  let key;
  const new_scope = {};

  for (let i = keys.length - 1; i >= 0; i--) {
    key = keys[i];
    if ('function' === typeof scope[key]) {
      new_scope[key] = new Code(String(scope[key]));
    } else {
      new_scope[key] = processScope(scope[key]);
    }
  }

  return new_scope;
}

module.exports = MapReduceOperation;
