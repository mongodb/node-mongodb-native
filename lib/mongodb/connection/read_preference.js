var ReadPreference = function(mode, tags) {	
  this._type = 'ReadPreference';
	this.mode = mode;
  this.tags = tags;
}

ReadPreference.prototype.toObject = function() {
  var object = {mode:this.mode};

  if(this.tags != null) {
    object['tags'] = this.tags;
  }

  return object;
}

ReadPreference.PRIMARY = 'primary';
ReadPreference.PRIMARY_PREFERRED = 'primaryPreferred';
ReadPreference.SECONDARY = 'secondary';
ReadPreference.SECONDARY_PREFERRED = 'secondaryPreferred';
ReadPreference.NEAREST = 'nearest'

exports.ReadPreference  = ReadPreference;