/**
 * A class representation of the BSON DBRef type.
 *
 * @class Represents the BSON DBRef type.
 * @param {String} namespace the collection name.
 * @param {ObjectID} oid the reference ObjectID.
 * @param {String} [db] optional db name, if omitted the reference is local to the current db.
 * @return {DBRef}
 */
function DBRef(namespace, oid, db) {
  if(!(this instanceof DBRef)) return new DBRef(namespace, oid, db);
  
  this._bsontype = 'DBRef';
  this.namespace = namespace;
  this.oid = oid;
  this.db = db;
};

/**
 * @ignore
 * @api private
 */
DBRef.prototype.toJSON = function() {
  return {
    '$ref':this.namespace,
    '$id':this.oid,
    '$db':this.db == null ? '' : this.db
  };
}

exports.DBRef = DBRef;