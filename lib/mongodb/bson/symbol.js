/**
 * Symbol constructor.
 *
 * @param {TODO} value
 */
function Symbol(value) {
  this._bsontype = 'Symbol';
  this.value = value;
}

Symbol.prototype.toString = function() {
  return this.value;
}

Symbol.prototype.inspect = function() {
  return this.value;
}

Symbol.prototype.toJSON = function() {
  return this.value;
}

exports.Symbol = Symbol;