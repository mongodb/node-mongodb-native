'use strict';

const MongoClient = require('../../lib/mongo_client');
/* include stuff */

describe('CRUD', function() {

  it('should insert a document', {
    metadata: { requires: { mongodb: '>=3.6.0', topology: 'single' } },
    test: function() {
      const client = new MongoClient('mongodb://localhost:27017');
      return client.connect()
        .then(() => insert)
        .then(() => find);
    }
  });
});
