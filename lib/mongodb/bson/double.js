exports.Double = Double;

function Double(value) {
  this._bsontype = 'Double';
  this.value = value;
}

Double.prototype.valueOf = function() {
  return this.value;
};

Double.prototype.toJSON = function() {
  return this.value;
}
