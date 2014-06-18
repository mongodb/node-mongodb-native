var setProperty = require('../connection/utils').setProperty
  , getProperty = require('../connection/utils').getProperty
  , getSingleProperty = require('../connection/utils').getSingleProperty;

/**
 * Creates a new CommandResult instance
 * @class
 * @param {object} result CommandResult object
 * @param {Connection} connection A connection instance associated with this result
 * @return {CommandResult} A cursor instance
 */
var CommandResult = function(result, connection) {
  getSingleProperty(this, 'result', result);
  getSingleProperty(this, 'connection', connection);

  /**
   * Convert CommandResult to JSON
   * @method
   * @return {object}
   */
  this.toJSON = function() {
    return result;
  }

  /**
   * Convert CommandResult to String representation
   * @method
   * @return {string}
   */
  this.toString = function() {
    return JSON.stringify(this.toJSON());
  }
}

module.exports = CommandResult;