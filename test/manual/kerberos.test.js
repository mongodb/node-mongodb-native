'use strict';
const MongoClient = require('../..').MongoClient;
const chai = require('chai');
const expect = chai.expect;

describe('Kerberos', function() {
  if (process.env.MONGODB_URI == null) {
    console.log('skipping Kerberos tests, MONGODB_URI environment variable is not defined');
    return;
  }
  let krb5Uri = `${process.env.MONGODB_URI}&gssapiServiceName=mongodb`;
  if (process.platform === 'win32') {
    console.log('Win32 run detected');
    if (process.env.LDAPTEST_PASSWORD == null) {
      throw new Error('The env parameter LDAPTEST_PASSWORD must be set');
    }
    const parts = krb5Uri.split('@', 2);
    krb5Uri = `${parts[0]}:${process.env.LDAPTEST_PASSWORD}@${parts[1]}`;
  }

  it('should authenticate with original uri', function(done) {
    const client = new MongoClient(krb5Uri, { useUnifiedTopology: true });
    client.connect(function(err, client) {
      expect(err).to.not.exist;
      client
        .db('kerberos')
        .collection('test')
        .find()
        .toArray(function(err, docs) {
          expect(err).to.not.exist;
          expect(docs[0].kerberos).to.be.true;

          client.close(done);
        });
    });
  });

  it('validate that SERVICE_REALM and CANONICALIZE_HOST_NAME can be passed in', function(done) {
    const client = new MongoClient(
      `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:false,SERVICE_REALM:windows&maxPoolSize=1`,
      { useUnifiedTopology: true }
    );
    client.connect(function(err, client) {
      expect(err).to.not.exist;
      client
        .db('kerberos')
        .collection('test')
        .find()
        .toArray(function(err, docs) {
          expect(err).to.not.exist;
          expect(docs[0].kerberos).to.be.true;

          client.close(done);
        });
    });
  });

  it('should authenticate with additional authentication properties', function(done) {
    const client = new MongoClient(
      `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:false&maxPoolSize=1`,
      { useUnifiedTopology: true }
    );
    client.connect(function(err, client) {
      expect(err).to.not.exist;
      client
        .db('kerberos')
        .collection('test')
        .find()
        .toArray(function(err, docs) {
          expect(err).to.not.exist;
          expect(docs[0].kerberos).to.be.true;

          client.close(done);
        });
    });
  });

  it('should fail to authenticate with bad credentials', function(done) {
    const client = new MongoClient(
      krb5Uri.replace(encodeURIComponent(process.env.KRB5_PRINCIPAL), 'bad%40creds.cc'),
      { useUnifiedTopology: true }
    );
    client.connect(function(err) {
      expect(err).to.exist;
      expect(err.codeName).to.equal('AuthenticationFailed');
      done();
    });
  });
});
