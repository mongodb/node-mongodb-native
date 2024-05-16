'use strict';
const { MongoClient } = require('../mongodb');
const { expect } = require('chai');

describe('LDAP', function () {
  if (process.env.MONGODB_URI == null) {
    throw new Error(`skipping SSL tests, MONGODB_URI environment variable is not defined`);
  }

  it('Should correctly authenticate against ldap', function (done) {
    const client = new MongoClient(process.env.MONGODB_URI);
    client.connect(function (err, client) {
      expect(err).to.not.exist;
      client
        .db('ldap')
        .collection('test')
        .findOne(function (err, doc) {
          expect(err).to.not.exist;
          expect(doc).property('ldap').to.equal(true);
          client.close(done);
        });
    });
  });
});
