/**
 * Code constructor.
 *
 * @param {TODO} code
 * @param {TODO} scope
 */

function Code(code, scope) {
  this._bsontype = 'Code';
  this.code = code;
  this.scope = scope == null ? {} : scope;
};

Code.prototype.toJSON = function() {
  return {scope:this.scope, code:this.code};
}

exports.Code = Code;