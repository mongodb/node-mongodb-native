var setProperty = require('../connection/utils').setProperty
  , getProperty = require('../connection/utils').getProperty
  , getSingleProperty = require('../connection/utils').getSingleProperty;

var CommandResult = function(result, connection) {
  getSingleProperty(this, 'result', result);
  getSingleProperty(this, 'connection', connection);

  this.toJSON = function() {
    return result;
  }

  this.toString = function() {
    return JSON.stringify(this.toJSON());
  }
}

module.exports = CommandResult;