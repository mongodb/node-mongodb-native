'use strict';

const Collection = require('../collection');
const handleCallback = require('../utils').handleCallback;

function collections(self, options, callback) {
  options = Object.assign({}, options, { nameOnly: true });
  // Let's get the collection names
  self.listCollections({}, options).toArray(function(err, documents) {
    if (err != null) return handleCallback(callback, err, null);
    // Filter collections removing any illegal ones
    documents = documents.filter(function(doc) {
      return doc.name.indexOf('$') === -1;
    });

    // Return the collection objects
    handleCallback(
      callback,
      null,
      documents.map(function(d) {
        return new Collection(
          self,
          self.s.topology,
          self.s.databaseName,
          d.name,
          self.s.pkFactory,
          self.s.options
        );
      })
    );
  });
}

module.exports = collections;
