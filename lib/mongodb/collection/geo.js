var shared = require('./shared')
  , utils = require('../utils');

var geoNear = function geoNear(x, y, options, callback) {
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  // Fetch all commands
  options = args.length ? args.shift() || {} : {};

  // Build command object
  var commandObject = {
    geoNear:this.collectionName,
    near: [x, y]
  }

  // Decorate object if any with known properties
  if(options['num'] != null) commandObject['num'] = options['num'];
  if(options['maxDistance'] != null) commandObject['maxDistance'] = options['maxDistance'];
  if(options['distanceMultiplier'] != null) commandObject['distanceMultiplier'] = options['distanceMultiplier'];
  if(options['query'] != null) commandObject['query'] = options['query'];
  if(options['spherical'] != null) commandObject['spherical'] = options['spherical'];
  if(options['uniqueDocs'] != null) commandObject['uniqueDocs'] = options['uniqueDocs'];
  if(options['includeLocs'] != null) commandObject['includeLocs'] = options['includeLocs'];

  // Ensure we have the right read preference inheritance
  options.readPreference = shared._getReadConcern(this, options);

  // Execute the command
  this.db.command(commandObject, options, function (err, res) {
    if (err) {
      callback(err);
    } else if (res.err || res.errmsg) {
      callback(utils.toError(res));
    } else {
      // should we only be returning res.results here? Not sure if the user
      // should see the other return information
      callback(null, res);
    }
  });
}

var geoHaystackSearch = function geoHaystackSearch(x, y, options, callback) {
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  // Fetch all commands
  options = args.length ? args.shift() || {} : {};

  // Build command object
  var commandObject = {
    geoSearch:this.collectionName,
    near: [x, y]
  }

  // Decorate object if any with known properties
  if(options['maxDistance'] != null) commandObject['maxDistance'] = options['maxDistance'];
  if(options['query'] != null) commandObject['search'] = options['query'];
  if(options['search'] != null) commandObject['search'] = options['search'];
  if(options['limit'] != null) commandObject['limit'] = options['limit'];

  // Ensure we have the right read preference inheritance
  options.readPreference = shared._getReadConcern(this, options);

  // Execute the command
  this.db.command(commandObject, options, function (err, res) {
    if (err) {
      callback(err);
    } else if (res.err || res.errmsg) {
      callback(utils.toError(res));
    } else {
      // should we only be returning res.results here? Not sure if the user
      // should see the other return information
      callback(null, res);
    }
  });
}

exports.geoNear = geoNear;
exports.geoHaystackSearch = geoHaystackSearch;
