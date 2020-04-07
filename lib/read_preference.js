'use strict';

/**
 * The **ReadPreference** class is a class that represents a MongoDB ReadPreference and is
 * used to construct connections.
 *
 * @class
 * @see https://docs.mongodb.com/manual/core/read-preference/
 */
class ReadPreference {
  /**
   * @param {string} mode A string describing the read preference mode (primary|primaryPreferred|secondary|secondaryPreferred|nearest)
   * @param {object[]} [tags] A tag set used to target reads to members with the specified tag(s). tagSet is not available if using read preference mode primary.
   * @param {object} [options] Additional read preference options
   * @param {number} [options.maxStalenessSeconds] Max secondary read staleness in seconds, Minimum value is 90 seconds.
   */
  constructor(mode, tags, options) {
    if (!ReadPreference.isValid(mode)) {
      throw new TypeError(`Invalid read preference mode ${mode}`);
    }
    if (options === undefined && typeof tags === 'object' && !Array.isArray(tags)) {
      options = tags;
      tags = undefined;
    } else if (tags && !Array.isArray(tags)) {
      throw new TypeError('ReadPreference tags must be an array');
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
    if (this.mode === ReadPreference.PRIMARY) {
      if (this.tags && Array.isArray(this.tags) && this.tags.length > 0) {
        throw new TypeError('Primary read preference cannot be combined with tags');
      }
      if (this.maxStalenessSeconds) {
        throw new TypeError('Primary read preference cannot be combined with maxStalenessSeconds');
      }
    }
  }
  /**
   * Validate if a mode is legal
   *
   * @function
   * @param {string} mode The string representing the read preference mode.
   * @returns {boolean} True if a mode is valid
   */
  isValid(mode) {
    return ReadPreference.isValid(typeof mode === 'string' ? mode : this.mode);
  }
  /**
   * Indicates that this readPreference needs the "slaveOk" bit when sent over the wire
   *
   * @function
   * @returns {boolean}
   * @see https://docs.mongodb.com/manual/reference/mongodb-wire-protocol/#op-query
   */
  slaveOk() {
    return needSlaveOk.indexOf(this.mode) !== -1;
  }
  /**
   * Are the two read preference equal
   *
   * @function
   * @param {ReadPreference} readPreference The read preference with which to check equality
   * @returns {boolean} True if the two ReadPreferences are equivalent
   */
  equals(readPreference) {
    return readPreference.mode === this.mode;
  }
  /**
   * Return JSON representation
   *
   * @function
   * @returns {object} A JSON representation of the ReadPreference
   */
  toJSON() {
    const readPreference = { mode: this.mode };
    if (Array.isArray(this.tags)) readPreference.tags = this.tags;
    if (this.maxStalenessSeconds) readPreference.maxStalenessSeconds = this.maxStalenessSeconds;
    return readPreference;
  }
  /**
   * Construct a ReadPreference given an options object.
   *
   * @param {object} options The options object from which to extract the read preference.
   * @returns {ReadPreference}
   */
  static fromOptions(options) {
    const readPreference = options.readPreference;
    const readPreferenceTags = options.readPreferenceTags;
    if (readPreference == null) {
      return null;
    }
    if (typeof readPreference === 'string') {
      return new ReadPreference(readPreference, readPreferenceTags);
    } else if (!(readPreference instanceof ReadPreference) && typeof readPreference === 'object') {
      const mode = readPreference.mode || readPreference.preference;
      if (mode && typeof mode === 'string') {
        return new ReadPreference(mode, readPreference.tags, {
          maxStalenessSeconds: readPreference.maxStalenessSeconds
        });
      }
    }
    return readPreference;
  }
  /**
   * Validate if a mode is legal
   *
   * @function
   * @param {string} mode The string representing the read preference mode.
   * @returns {boolean} True if a mode is valid
   */
  static isValid(mode) {
    return VALID_MODES.indexOf(mode) !== -1;
  }
}

// Support the deprecated `preference` property introduced in the porcelain layer
Object.defineProperty(ReadPreference.prototype, 'preference', {
  enumerable: true,
  get: function() {
    return this.mode;
  }
});

/*
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
  null
];

const needSlaveOk = ['primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'];

/**
 * Primary read preference
 *
 * @member
 * @type {ReadPreference}
 */
ReadPreference.primary = new ReadPreference('primary');
/**
 * Primary Preferred read preference
 *
 * @member
 * @type {ReadPreference}
 */
ReadPreference.primaryPreferred = new ReadPreference('primaryPreferred');
/**
 * Secondary read preference
 *
 * @member
 * @type {ReadPreference}
 */
ReadPreference.secondary = new ReadPreference('secondary');
/**
 * Secondary Preferred read preference
 *
 * @member
 * @type {ReadPreference}
 */
ReadPreference.secondaryPreferred = new ReadPreference('secondaryPreferred');
/**
 * Nearest read preference
 *
 * @member
 * @type {ReadPreference}
 */
ReadPreference.nearest = new ReadPreference('nearest');

module.exports = ReadPreference;
