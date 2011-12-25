/**
 * DBRef constructor.
 *
 * @param {TODO} namespace
 * @param {TODO} oid
 * @param {TODO} db
 */

function DBRef (namespace, oid, db) {
  this._bsontype = 'DBRef';
  this.namespace = namespace;
  this.oid = oid;
  this.db = db;
};

DBRef.prototype.toJSON = function() {
  return {
    '$ref':this.namespace,
    '$id':this.oid,
    '$db':this.db == null ? '' : this.db
  };
}

exports.DBRef = DBRef;