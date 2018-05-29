'use strict';

const ReadPreference = require('mongodb-core').ReadPreference;

/**
 * Ensures provided read preference is properly converted into an object
 * @param {(ReadPreference|string|object)} readPreference the user provided read preference
 * @return {ReadPreference}
 */
function convertReadPreference(readPreference) {
  if (readPreference) {
    if (typeof readPreference === 'string') {
      return new ReadPreference(readPreference);
    } else if (
      readPreference &&
      !(readPreference instanceof ReadPreference) &&
      typeof readPreference === 'object'
    ) {
      const mode = readPreference.mode || readPreference.preference;
      if (mode && typeof mode === 'string') {
        return new ReadPreference(mode, readPreference.tags, {
          maxStalenessSeconds: readPreference.maxStalenessSeconds
        });
      }
    } else if (!(readPreference instanceof ReadPreference)) {
      throw new TypeError('Invalid read preference: ' + readPreference);
    }
  }

  return readPreference;
}

function profilingInfo(self, options, callback) {
  try {
    self
      .collection('system.profile')
      .find({}, null, options)
      .toArray(callback);
  } catch (err) {
    return callback(err, null);
  }
}

function profilingLevel(self, options, callback) {
  self.command({ profile: -1 }, options, function(err, doc) {
    if (err == null && doc.ok === 1) {
      var was = doc.was;
      if (was === 0) return callback(null, 'off');
      if (was === 1) return callback(null, 'slow_only');
      if (was === 2) return callback(null, 'all');
      return callback(new Error('Error: illegal profiling level value ' + was), null);
    } else {
      err != null ? callback(err, null) : callback(new Error('Error with profile command'), null);
    }
  });
}

function setProfilingLevel(self, level, options, callback) {
  var command = {};
  var profile = 0;

  if (level === 'off') {
    profile = 0;
  } else if (level === 'slow_only') {
    profile = 1;
  } else if (level === 'all') {
    profile = 2;
  } else {
    return callback(new Error('Error: illegal profiling level value ' + level));
  }

  // Set up the profile number
  command['profile'] = profile;

  self.command(command, options, function(err, doc) {
    if (err == null && doc.ok === 1) return callback(null, level);
    return err != null
      ? callback(err, null)
      : callback(new Error('Error with profile command'), null);
  });
}

exports.convertReadPreference = convertReadPreference;
exports.profilingInfo = profilingInfo;
exports.profilingLevel = profilingLevel;
exports.setProfilingLevel = setProfilingLevel;
