var getSingleProperty = require('../connection/utils').getSingleProperty;

var needSlaveOk = ['primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'];

var ReadPreference = function(preference, tags, options) {
  this.slaveOk = function() {
    return needSlaveOk.indexOf(preference) != -1;
  }

  this.equals = function(readPreference) {
    return readPreference.preference == preference;
  }

  // Define properties
  getSingleProperty(this, 'preference', preference);
  getSingleProperty(this, 'tags', tags || {});
  getSingleProperty(this, 'options', options);
}

ReadPreference.primary = new ReadPreference('primary');
ReadPreference.primaryPreferred = new ReadPreference('primaryPreferred');
ReadPreference.secondary = new ReadPreference('secondary');
ReadPreference.secondaryPreferred = new ReadPreference('secondaryPreferred');
ReadPreference.nearest = new ReadPreference('nearest');

module.exports = ReadPreference;