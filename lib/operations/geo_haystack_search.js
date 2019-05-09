'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const OperationBase = require('./operation').OperationBase;
const decorateCommand = require('../utils').decorateCommand;
const decorateWithReadConcern = require('../utils').decorateWithReadConcern;
const executeCommand = require('./db_ops').executeCommand;
const handleCallback = require('../utils').handleCallback;
const resolveReadPreference = require('../utils').resolveReadPreference;
const toError = require('../utils').toError;

/**
 * Execute a geo search using a geo haystack index on a collection.
 *
 * @class
 * @property {Collection} a Collection instance.
 * @property {number} x Point to search on the x axis, ensure the indexes are ordered in the same order.
 * @property {number} y Point to search on the y axis, ensure the indexes are ordered in the same order.
 * @property {object} [options] Optional settings. See Collection.prototype.geoHaystackSearch for a list of options.
 */
class GeoHaystackSearchOperation extends OperationBase {
  /**
   * Construct a GeoHaystackSearch operation.
   *
   * @param {Collection} a Collection instance.
   * @param {number} x Point to search on the x axis, ensure the indexes are ordered in the same order.
   * @param {number} y Point to search on the y axis, ensure the indexes are ordered in the same order.
   * @param {object} [options] Optional settings. See Collection.prototype.geoHaystackSearch for a list of options.
   */
  constructor(collection, x, y, options) {
    super(options);

    this.collection = collection;
    this.x = x;
    this.y = y;
  }

  /**
   * Execute the operation.
   *
   * @param {Collection~resultCallback} [callback] The command result callback
   */
  execute(callback) {
    const coll = this.collection;
    const x = this.x;
    const y = this.y;
    let options = this.options;

    // Build command object
    let commandObject = {
      geoSearch: coll.collectionName,
      near: [x, y]
    };

    // Remove read preference from hash if it exists
    commandObject = decorateCommand(commandObject, options, ['readPreference', 'session']);

    options = Object.assign({}, options);
    // Ensure we have the right read preference inheritance
    options.readPreference = resolveReadPreference(coll, options);

    // Do we have a readConcern specified
    decorateWithReadConcern(commandObject, coll, options);

    // Execute the command
    executeCommand(coll.s.db, commandObject, options, (err, res) => {
      if (err) return handleCallback(callback, err);
      if (res.err || res.errmsg) handleCallback(callback, toError(res));
      // should we only be returning res.results here? Not sure if the user
      // should see the other return information
      handleCallback(callback, null, res);
    });
  }
}

defineAspects(GeoHaystackSearchOperation, Aspect.READ_OPERATION);

module.exports = GeoHaystackSearchOperation;
