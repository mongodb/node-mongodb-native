'use strict';

const CommandOperation = require('./command');

class ValidateCollectionOperation extends CommandOperation {
  constructor(admin, collectionName, options) {
    // Decorate command with extra options
    let command = { validate: collectionName };
    const keys = Object.keys(options);
    for (let i = 0; i < keys.length; i++) {
      if (Object.prototype.hasOwnProperty.call(options, keys[i]) && keys[i] !== 'session') {
        command[keys[i]] = options[keys[i]];
      }
    }

    super(admin.s.db, options, null, command);
    this.collectionName = collectionName;
  }

  execute(callback) {
    const collectionName = this.collectionName;

    super.execute((err, doc) => {
      if (err != null) return callback(err, null);

      if (doc.ok === 0) return callback(new Error('Error with validate command'), null);
      if (doc.result != null && doc.result.constructor !== String)
        return callback(new Error('Error with validation data'), null);
      if (doc.result != null && doc.result.match(/exception|corrupt/) != null)
        return callback(new Error('Error: invalid collection ' + collectionName), null);
      if (doc.valid != null && !doc.valid)
        return callback(new Error('Error: invalid collection ' + collectionName), null);

      return callback(null, doc);
    });
  }
}

module.exports = ValidateCollectionOperation;
