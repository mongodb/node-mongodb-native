'use strict';

/**
 * The **ReadPreference** class is a class that represents a MongoDB ReadPreference and is
 * used to construct connections.
 * @class
 * @param {string} mode A string describing the read preference mode (primary|primaryPreferred|secondary|secondaryPreferred|nearest)
 * @param {array} tags The tags object
 * @param {object} [options] Additional read preference options
 * @param {number} [options.maxStalenessSeconds] Max secondary read staleness in seconds, Minimum value is 90 seconds.
 * @param {object} [options.hedge] Server mode in which the same query is dispatched in parallel to multiple replica set members.
 * @param {boolean} [options.hedge.enabled] Explicitly enable or disable hedged reads.
 * @see https://docs.mongodb.com/manual/core/read-preference/
 * @return {ReadPreference}
 */
const ReadPreference = function(mode, tags, options) {
  if (!ReadPreference.isValid(mode)) {
    throw new TypeError(`Invalid read preference mode ${mode}`);
  }

  // TODO(major): tags MUST be an array of tagsets
  if (tags && !Array.isArray(tags)) {
    console.warn(
      'ReadPreference tags must be an array, this will change in the next major version'
    );

    const tagsHasMaxStalenessSeconds = typeof tags.maxStalenessSeconds !== 'undefined';
    const tagsHasHedge = typeof tags.hedge !== 'undefined';
    const tagsHasOptions = tagsHasMaxStalenessSeconds || tagsHasHedge;
    if (tagsHasOptions) {
      // this is likely an options object
      options = tags;
      tags = undefined;
    } else {
      tags = [tags];
    }
  }

  this.mode = mode;
  this.tags = tags;
  this.hedge = options && options.hedge;

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

    if (this.hedge) {
      throw new TypeError('Primary read preference cannot be combined with hedge');
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

/**
 * Construct a ReadPreference given an options object.
 *
 * @param {object} options The options object from which to extract the read preference.
 * @return {ReadPreference}
 */
ReadPreference.fromOptions = function(options) {
  if (!options) return null;
  const readPreference = options.readPreference;
  if (!readPreference) return null;
  const readPreferenceTags = options.readPreferenceTags;
  const maxStalenessSeconds = options.maxStalenessSeconds;
  if (typeof readPreference === 'string') {
    return new ReadPreference(readPreference, readPreferenceTags);
  } else if (!(readPreference instanceof ReadPreference) && typeof readPreference === 'object') {
    const mode = readPreference.mode || readPreference.preference;
    if (mode && typeof mode === 'string') {
      return new ReadPreference(mode, readPreference.tags, {
        maxStalenessSeconds: readPreference.maxStalenessSeconds || maxStalenessSeconds,
        hedge: readPreference.hedge
      });
    }
  }

  return readPreference;
};

/**
 * Resolves a read preference based on well-defined inheritance rules. This method will not only
 * determine the read preference (if there is one), but will also ensure the returned value is a
 * properly constructed instance of `ReadPreference`.
 *
 * @param {Collection|Db|MongoClient} parent The parent of the operation on which to determine the read
 * preference, used for determining the inherited read preference.
 * @param {object} options The options passed into the method, potentially containing a read preference
 * @returns {(ReadPreference|null)} The resolved read preference
 */
ReadPreference.resolve = function(parent, options) {
  options = options || {};
  const session = options.session;

  const inheritedReadPreference = parent && parent.readPreference;

  let readPreference;
  if (options.readPreference) {
    readPreference = ReadPreference.fromOptions(options);
  } else if (session && session.inTransaction() && session.transaction.options.readPreference) {
    // The transaction’s read preference MUST override all other user configurable read preferences.
    readPreference = session.transaction.options.readPreference;
  } else if (inheritedReadPreference != null) {
    readPreference = inheritedReadPreference;
  } else {
    readPreference = ReadPreference.primary;
  }

  return typeof readPreference === 'string' ? new ReadPreference(readPreference) : readPreference;
};

/**
 * Replaces options.readPreference with a ReadPreference instance
 */
ReadPreference.translate = function(options) {
  if (options.readPreference == null) return options;
  const r = options.readPreference;

  if (typeof r === 'string') {
    options.readPreference = new ReadPreference(r);
  } else if (r && !(r instanceof ReadPreference) && typeof r === 'object') {
    const mode = r.mode || r.preference;
    if (mode && typeof mode === 'string') {
      options.readPreference = new ReadPreference(mode, r.tags, {
        maxStalenessSeconds: r.maxStalenessSeconds
      });
    }
  } else if (!(r instanceof ReadPreference)) {
    throw new TypeError('Invalid read preference: ' + r);
  }

  return options;
};

/**
 * Validate if a mode is legal
 *
 * @method
 * @param {string} mode The string representing the read preference mode.
 * @return {boolean} True if a mode is valid
 */
ReadPreference.isValid = function(mode) {
  return VALID_MODES.indexOf(mode) !== -1;
};

/**
 * Validate if a mode is legal
 *
 * @method
 * @param {string} mode The string representing the read preference mode.
 * @return {boolean} True if a mode is valid
 */
ReadPreference.prototype.isValid = function(mode) {
  return ReadPreference.isValid(typeof mode === 'string' ? mode : this.mode);
};

const needSlaveOk = ['primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'];

/**
 * Indicates that this readPreference needs the "slaveOk" bit when sent over the wire
 * @method
 * @return {boolean}
 * @see https://docs.mongodb.com/manual/reference/mongodb-wire-protocol/#op-query
 */
ReadPreference.prototype.slaveOk = function() {
  return needSlaveOk.indexOf(this.mode) !== -1;
};

/**
 * Are the two read preference equal
 * @method
 * @param {ReadPreference} readPreference The read preference with which to check equality
 * @return {boolean} True if the two ReadPreferences are equivalent
 */
ReadPreference.prototype.equals = function(readPreference) {
  return readPreference.mode === this.mode;
};

/**
 * Return JSON representation
 * @method
 * @return {Object} A JSON representation of the ReadPreference
 */
ReadPreference.prototype.toJSON = function() {
  const readPreference = { mode: this.mode };
  if (Array.isArray(this.tags)) readPreference.tags = this.tags;
  if (this.maxStalenessSeconds) readPreference.maxStalenessSeconds = this.maxStalenessSeconds;
  if (this.hedge) readPreference.hedge = this.hedge;
  return readPreference;
};

/**
 * Primary read preference
 * @member
 * @type {ReadPreference}
 */
ReadPreference.primary = new ReadPreference('primary');
/**
 * Primary Preferred read preference
 * @member
 * @type {ReadPreference}
 */
ReadPreference.primaryPreferred = new ReadPreference('primaryPreferred');
/**
 * Secondary read preference
 * @member
 * @type {ReadPreference}
 */
ReadPreference.secondary = new ReadPreference('secondary');
/**
 * Secondary Preferred read preference
 * @member
 * @type {ReadPreference}
 */
ReadPreference.secondaryPreferred = new ReadPreference('secondaryPreferred');
/**
 * Nearest read preference
 * @member
 * @type {ReadPreference}
 */
ReadPreference.nearest = new ReadPreference('nearest');

module.exports = ReadPreference;
