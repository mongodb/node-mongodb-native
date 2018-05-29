'use strict';

const Code = require('mongodb-core').BSON.Code;
const f = require('util').format;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('mongodb-core').MongoError;
const ReadPreference = require('mongodb-core').ReadPreference;

const evaluate = function(self, code, parameters, options, callback) {
  var finalCode = code;
  var finalParameters = [];

  // Did the user destroy the topology
  if (self.serverConfig && self.serverConfig.isDestroyed())
    return callback(new MongoError('topology was destroyed'));

  // If not a code object translate to one
  if (!(finalCode && finalCode._bsontype === 'Code')) finalCode = new Code(finalCode);
  // Ensure the parameters are correct
  if (parameters != null && !Array.isArray(parameters) && typeof parameters !== 'function') {
    finalParameters = [parameters];
  } else if (parameters != null && Array.isArray(parameters) && typeof parameters !== 'function') {
    finalParameters = parameters;
  }

  // Create execution selector
  var cmd = { $eval: finalCode, args: finalParameters };
  // Check if the nolock parameter is passed in
  if (options['nolock']) {
    cmd['nolock'] = options['nolock'];
  }

  // Set primary read preference
  options.readPreference = new ReadPreference(ReadPreference.PRIMARY);

  // Execute the command
  self.command(cmd, options, function(err, result) {
    if (err) return handleCallback(callback, err, null);
    if (result && result.ok === 1) return handleCallback(callback, null, result.retval);
    if (result)
      return handleCallback(
        callback,
        MongoError.create({ message: f('eval failed: %s', result.errmsg), driver: true }),
        null
      );
    handleCallback(callback, err, result);
  });
};

module.exports = evaluate;
