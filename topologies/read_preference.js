var needSlaveOk = ['primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'];

var ReadPreference = function(preference, tags) {

  this.slaveOk = function() {
    return needSlaveOk.indexOf(preference) != -1;
  }
}

ReadPreference.primary = 'primary';
ReadPreference.primaryPreferred = 'primaryPreferred';
ReadPreference.secondary = 'secondary';
ReadPreference.secondaryPreferred = 'secondaryPreferred';
ReadPreference.nearest = 'nearest';

module.exports = ReadPreference;