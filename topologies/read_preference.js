'use strict';

/**
 * @fileOverview The **ReadPreference** class is a class that represents a MongoDB ReadPreference and is
 * used to construct connections.
 *
 * @example
 * const ReplSet = require('mongodb-core').ReplSet,
 *   ReadPreference = require('mongodb-core').ReadPreference,
 *   assert = require('assert');
 *
 * const server = new ReplSet([{host: 'localhost', port: 30000}], {setName: 'rs'});
 * // Wait for the connection event
 * server.on('connect', function(server) {
 *   const cursor = server.cursor(
 *     'db.test',
 *     { find: 'db.test', query: {} },
 *     { readPreference: new ReadPreference('secondary') }
 *   );
 *
 *   cursor.next(function(err, doc) {
 *     server.destroy();
 *   });
 * });
 *
 * // Start connecting
 * server.connect();
 */

/**
 * Creates a new Pool instance
 * @class
 * @param {string} mode A string describing the read preference mode (primary|primaryPreferred|secondary|secondaryPreferred|nearest)
 * @param {array} tags The tags object
 * @param {object} [options] Additional read preference options
 * @param {number} [options.maxStalenessSeconds] Max secondary read staleness in seconds, Minimum value is 90 seconds.
 * @property {string} mode The read preference mode (primary|primaryPreferred|secondary|secondaryPreferred|nearest)
 * @property {array} tags The tags object
 * @property {object} options Additional read preference options
 * @property {number} maxStalenessSeconds MaxStalenessSeconds value for the read preference
 * @return {ReadPreference}
 */
const ReadPreference = function(mode, tags, options) {
  // TODO(major): tags MUST be an array of tagsets
  if (tags && !Array.isArray(tags)) {
    console.warn(
      'ReadPreference tags must be an array, this will change in the next major version'
    );

    if (typeof tags.maxStalenessSeconds !== 'undefined') {
      // this is likely an options object
      options = tags;
      tags = undefined;
    } else {
      tags = [tags];
    }
  }

  this.mode = mode;
  this.tags = tags;

  options = options || {};
  if (options.maxStalenessSeconds != null) {
    if (options.maxStalenessSeconds <= 0) {
      throw new TypeError('maxStalenessSeconds must be a positive integer');
    }

    this.maxStalenessSeconds = options.maxStalenessSeconds;

    // NOTE: The minimum required wire version is 5 for this read preference. If the existing
    //       topology has a lower value then a MongoError will be thrown during server selection.
    this.minWireVersion = 5;
  }

  if (this.mode === ReadPreference.PRIMARY || this.mode === true) {
    if (this.tags && Array.isArray(this.tags) && this.tags.length > 0) {
      throw new TypeError('Primary read preference cannot be combined with tags');
    }

    if (this.maxStalenessSeconds) {
      throw new TypeError('Primary read preference cannot be combined with maxStalenessSeconds');
    }
  }
};

// Support the deprecated `preference` property introduced in the porcelain layer
Object.defineProperty(ReadPreference.prototype, 'preference', {
  enumerable: true,
  get: function() {
    return this.mode;
  }
});

/**
 * Read preference mode constants
 */
ReadPreference.PRIMARY = 'primary';
ReadPreference.PRIMARY_PREFERRED = 'primaryPreferred';
ReadPreference.SECONDARY = 'secondary';
ReadPreference.SECONDARY_PREFERRED = 'secondaryPreferred';
ReadPreference.NEAREST = 'nearest';

const VALID_MODES = [
  ReadPreference.PRIMARY,
  ReadPreference.PRIMARY_PREFERRED,
  ReadPreference.SECONDARY,
  ReadPreference.SECONDARY_PREFERRED,
  ReadPreference.NEAREST,
  true,
  false,
  null
];

/**
 * Validate if a mode is legal
 *
 * @method
 * @param {string} mode The string representing the read preference mode.
 * @return {boolean}
 */
ReadPreference.isValid = function(mode) {
  return VALID_MODES.indexOf(mode) !== -1;
};

/**
 * Validate if a mode is legal
 *
 * @method
 * @param {string} mode The string representing the read preference mode.
 * @return {boolean}
 */
ReadPreference.prototype.isValid = function(mode) {
  return ReadPreference.isValid(typeof mode === 'string' ? mode : this.mode);
};

const needSlaveOk = ['primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'];

/**
 * This needs slaveOk bit set
 * @method
 * @return {boolean}
 */
ReadPreference.prototype.slaveOk = function() {
  return needSlaveOk.indexOf(this.mode) !== -1;
};

/**
 * Are the two read preference equal
 * @method
 * @return {boolean}
 */
ReadPreference.prototype.equals = function(readPreference) {
  return readPreference.mode === this.mode;
};

/**
 * Return JSON representation
 * @method
 * @return {Object}
 */
ReadPreference.prototype.toJSON = function() {
  const readPreference = { mode: this.mode };
  if (Array.isArray(this.tags)) readPreference.tags = this.tags;
  if (this.maxStalenessSeconds) readPreference.maxStalenessSeconds = this.maxStalenessSeconds;
  return readPreference;
};

/**
 * Primary read preference
 * @method
 * @return {ReadPreference}
 */
ReadPreference.primary = new ReadPreference('primary');
/**
 * Primary Preferred read preference
 * @method
 * @return {ReadPreference}
 */
ReadPreference.primaryPreferred = new ReadPreference('primaryPreferred');
/**
 * Secondary read preference
 * @method
 * @return {ReadPreference}
 */
ReadPreference.secondary = new ReadPreference('secondary');
/**
 * Secondary Preferred read preference
 * @method
 * @return {ReadPreference}
 */
ReadPreference.secondaryPreferred = new ReadPreference('secondaryPreferred');
/**
 * Nearest read preference
 * @method
 * @return {ReadPreference}
 */
ReadPreference.nearest = new ReadPreference('nearest');

module.exports = ReadPreference;
