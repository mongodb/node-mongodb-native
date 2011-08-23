exports.Double = Double;

function Double(value) {
  this.value = value;
}

Double.prototype.valueOf = function() {
  return this.value;
};
