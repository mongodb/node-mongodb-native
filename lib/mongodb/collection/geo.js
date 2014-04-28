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

  // Ensure we have the right read preference inheritance
  options.readPreference = shared._getReadConcern(this, options);

  // Remove read preference from hash if it exists
  commandObject = utils.decorateCommand(commandObject, options, {readPreference: true});

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

  // Remove read preference from hash if it exists
  commandObject = utils.decorateCommand(commandObject, options, {readPreference: true});

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
