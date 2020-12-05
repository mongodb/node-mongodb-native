'use strict';
const MongoClient = require('../..').MongoClient;
var test = require('../functional/shared').assert;

describe('LDAP', function() {
  if (process.env.MONGODB_URI == null) {
    throw new Error(`skipping SSL tests, MONGODB_URI environment variable is not defined`);
  }

  it('Should correctly authenticate against ldap', function(done) {
    const client = new MongoClient(process.env.MONGODB_URI);
    client.connect(function(err, client) {
      test.equal(null, err);

      client
        .db('ldap')
        .collection('test')
        .findOne(function(err, doc) {
          test.equal(null, err);
          test.equal(true, doc.ldap);

          client.close(done);
        });
    });
  });
});
