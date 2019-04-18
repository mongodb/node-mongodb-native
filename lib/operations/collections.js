'use strict';

const OperationBase = require('./operation').OperationBase;
const handleCallback = require('../utils').handleCallback;

let collection;
function loadCollection() {
  if (!collection) {
    collection = require('../collection');
  }
  return collection;
}

class CollectionsOperation extends OperationBase {
  constructor(db, options) {
    super(options);

    this.db = db;
  }

  execute(callback) {
    const db = this.db;
    let options = this.options;

    let Collection = loadCollection();

    options = Object.assign({}, options, { nameOnly: true });
    // Let's get the collection names
    db.listCollections({}, options).toArray((err, documents) => {
      if (err != null) return handleCallback(callback, err, null);
      // Filter collections removing any illegal ones
      documents = documents.filter(doc => {
        return doc.name.indexOf('$') === -1;
      });

      // Return the collection objects
      handleCallback(
        callback,
        null,
        documents.map(d => {
          return new Collection(
            db,
            db.s.topology,
            db.databaseName,
            d.name,
            db.s.pkFactory,
            db.s.options
          );
        })
      );
    });
  }
}

module.exports = CollectionsOperation;
