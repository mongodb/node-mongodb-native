"use strict";

var needSlaveOk = ['primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'];

/**
 * @fileOverview The **ReadPreference** class is a class that represents a MongoDB ReadPreference and is
 * used to construct connections.
 *
 * @example
 * var ReplSet = require('mongodb-core').ReplSet
 *   , ReadPreference = require('mongodb-core').ReadPreference
 *   , assert = require('assert');
 *
 * var server = new ReplSet([{host: 'localhost', port: 30000}], {setName: 'rs'});
 * // Wait for the connection event
 * server.on('connect', function(server) {
 *   var cursor = server.cursor('db.test'
 *     , {find: 'db.test', query: {}}
 *     , {readPreference: new ReadPreference('secondary')});
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
 * @param {string} preference A string describing the preference (primary|primaryPreferred|secondary|secondaryPreferred|nearest)
 * @param {array} tags The tags object
 * @param {object} [options] Additional read preference options
 * @param {number} [options.maxStalenessMS] Max Secondary Read Stalleness in Miliseconds
 * @property {string} preference The preference string (primary|primaryPreferred|secondary|secondaryPreferred|nearest)
 * @property {array} tags The tags object
 * @property {object} options Additional read preference options
 * @property {number} maxStalenessMS MaxStalenessMS value for the read preference
 * @return {ReadPreference}
 */
var ReadPreference = function(preference, tags, options) {
  this.preference = preference;
  this.tags = tags;
  this.options = options;

  // If no tags were passed in
  if(tags && typeof tags == 'object') {
    this.options = tags, tags = null;
  }

  // Add the maxStalenessMS value to the read Preference
  if(this.options && this.options.maxStalenessMS) {
    this.maxStalenessMS = this.options.maxStalenessMS;
  }
}

/**
 * This needs slaveOk bit set
 * @method
 * @return {boolean}
 */
ReadPreference.prototype.slaveOk = function() {
  return needSlaveOk.indexOf(this.preference) != -1;
}

/**
 * Are the two read preference equal
 * @method
 * @return {boolean}
 */
ReadPreference.prototype.equals = function(readPreference) {
  return readPreference.preference == this.preference;
}

/**
 * Return JSON representation
 * @method
 * @return {Object}
 */
ReadPreference.prototype.toJSON = function() {
  var readPreference = {mode: this.preference};
  if(Array.isArray(this.tags)) readPreference.tags = this.tags;
  if(this.maxStalenessMS) readPreference.maxStalenessMS = this.maxStalenessMS;
  return readPreference;
}

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
