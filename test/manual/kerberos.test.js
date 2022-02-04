'use strict';
const { MongoClient } = require('../../src');
const chai = require('chai');

const expect = chai.expect;

function verifyKerberosAuthentication(client, done) {
  client
    .db('kerberos')
    .collection('test')
    .find()
    .toArray(function (err, docs) {
      let expectError;
      try {
        expect(err).to.not.exist;
        expect(docs).to.have.length(1);
        expect(docs[0].kerberos).to.be.true;
      } catch (e) {
        expectError = e;
      }
      client.close(e => done(expectError || e));
    });
}

describe('Kerberos', function () {
  if (process.env.MONGODB_URI == null) {
    console.error('skipping Kerberos tests, MONGODB_URI environment variable is not defined');
    return;
  }
  let krb5Uri = process.env.MONGODB_URI;
  const parts = krb5Uri.split('@', 2);

  if (!process.env.KRB5_PRINCIPAL) {
    console.error('skipping Kerberos tests, KRB5_PRINCIPAL environment variable is not defined');
    return;
  }

  if (process.platform === 'win32') {
    console.error('Win32 run detected');
    if (process.env.LDAPTEST_PASSWORD == null) {
      throw new Error('The env parameter LDAPTEST_PASSWORD must be set');
    }
    krb5Uri = `${parts[0]}:${process.env.LDAPTEST_PASSWORD}@${parts[1]}`;
  }

  it('should authenticate with original uri', function (done) {
    const client = new MongoClient(krb5Uri);
    client.connect(function (err, client) {
      expect(err).to.not.exist;
      verifyKerberosAuthentication(client, done);
    });
  });

  it('validate that CANONICALIZE_HOST_NAME can be passed in', async function () {
    const client = new MongoClient(
      `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:true&maxPoolSize=1`
    );
    await client.connect();
    verifyKerberosAuthentication(client, done);
    });
  });

  // Unskip this test when a proper setup is available - see NODE-3060
  it.skip('validate that SERVICE_REALM and CANONICALIZE_HOST_NAME can be passed in', function (done) {
    const client = new MongoClient(
      `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:false,SERVICE_REALM:windows&maxPoolSize=1`
    );
    client.connect(function (err, client) {
      expect(err).to.not.exist;
      verifyKerberosAuthentication(client, done);
    });
  });

  context('when passsing SERVICE_HOST', function () {
    context('when the SERVICE_HOST is invalid', function () {
      const client = new MongoClient(`${krb5Uri}&maxPoolSize=1`, {
        authMechanismProperties: {
          SERVICE_HOST: 'example.com'
        }
      });

      it('fails to authenticate', function () {
        return client.connect().catch(e => {
          expect(e).to.exist;
        });
      });
    });

    context('when the SERVICE_HOST is valid', function () {
      const client = new MongoClient(`${krb5Uri}&maxPoolSize=1`, {
        authMechanismProperties: {
          SERVICE_HOST: 'ldaptest.10gen.cc'
        }
      });

      it('authenticates', function (done) {
        client.connect(function (err, client) {
          expect(err).to.not.exist;
          verifyKerberosAuthentication(client, done);
        });
      });
    });
  });

  describe('should use the SERVICE_NAME property', function () {
    it('as an option handed to the MongoClient', function (done) {
      const client = new MongoClient(`${krb5Uri}&maxPoolSize=1`, {
        authMechanismProperties: {
          SERVICE_NAME: 'alternate'
        }
      });
      client.connect(function (err) {
        expect(err).to.exist;
        expect(err.message).to.match(
          /(Error from KDC: LOOKING_UP_SERVER)|(not found in Kerberos database)|(UNKNOWN_SERVER)/
        );
        done();
      });
    });

    it('as part of the query string parameters', function (done) {
      const client = new MongoClient(
        `${krb5Uri}&authMechanismProperties=SERVICE_NAME:alternate&maxPoolSize=1`
      );
      client.connect(function (err) {
        expect(err).to.exist;
        expect(err.message).to.match(
          /(Error from KDC: LOOKING_UP_SERVER)|(not found in Kerberos database)|(UNKNOWN_SERVER)/
        );
        done();
      });
    });
  });

  it('should fail to authenticate with bad credentials', function (done) {
    const client = new MongoClient(
      krb5Uri.replace(encodeURIComponent(process.env.KRB5_PRINCIPAL), 'bad%40creds.cc')
    );
    client.connect(function (err) {
      expect(err).to.exist;
      expect(err.message).to.match(/Authentication failed/);
      done();
    });
  });
});
