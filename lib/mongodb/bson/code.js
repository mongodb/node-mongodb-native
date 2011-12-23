/**
 * Code constructor.
 *
 * @param {TODO} code
 * @param {TODO} scope
 */

function Code(code, scope) {
  this.code = code;
  this.scope = scope == null ? {} : scope;
};

Code.prototype.toJSON = function() {
  return {scope:this.scope, code:this.code};
}

exports.Code = Code;