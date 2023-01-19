'use strict';
const { MongoClient } = require('../mongodb');
const chai = require('chai');
const sinon = require('sinon');
const dns = require('dns');

const expect = chai.expect;
chai.use(require('sinon-chai'));

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
  const sandbox = sinon.createSandbox();

  beforeEach(function () {
    sandbox.spy(dns);
  });

  afterEach(function () {
    sandbox.restore();
  });

  if (process.env.MONGODB_URI == null) {
    console.error('skipping Kerberos tests, MONGODB_URI environment variable is not defined');
    return;
  }
  let krb5Uri = process.env.MONGODB_URI;
  const parts = krb5Uri.split('@', 2);
  const host = parts[1].split('/')[0];

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

  context('when passing in CANONICALIZE_HOST_NAME', function () {
    beforeEach(function () {
      if (process.platform === 'darwin') {
        this.currentTest.skipReason =
          'DNS does not resolve with proper CNAME record on evergreen MacOS';
        this.skip();
      }
    });

    context('when the value is forward', function () {
      it('authenticates with a forward cname lookup', function (done) {
        const client = new MongoClient(
          `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:forward&maxPoolSize=1`
        );
        client.connect(function (err, client) {
          if (err) return done(err);
          expect(dns.resolveCname).to.be.calledOnceWith(host);
          verifyKerberosAuthentication(client, done);
        });
      });
    });

    for (const option of [false, 'none']) {
      context(`when the value is ${option}`, function () {
        it('authenticates with no dns lookups', function (done) {
          const client = new MongoClient(
            `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:${option}&maxPoolSize=1`
          );
          client.connect(function (err, client) {
            if (err) return done(err);
            expect(dns.resolveCname).to.not.be.called;
            // 2 calls when establishing connection - expect no third call.
            expect(dns.lookup).to.be.calledTwice;
            verifyKerberosAuthentication(client, done);
          });
        });
      });
    }

    for (const option of [true, 'forwardAndReverse']) {
      context(`when the value is ${option}`, function () {
        context('when the reverse lookup succeeds', function () {
          const resolveStub = (address, callback) => {
            callback(null, [host]);
          };

          beforeEach(function () {
            dns.resolvePtr.restore();
            sinon.stub(dns, 'resolvePtr').callsFake(resolveStub);
          });

          it('authenticates with a forward dns lookup and a reverse ptr lookup', function (done) {
            const client = new MongoClient(
              `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:${option}&maxPoolSize=1`
            );
            client.connect(function (err, client) {
              if (err) return done(err);
              // 2 calls to establish connection, 1 call in canonicalization.
              expect(dns.lookup).to.be.calledThrice;
              expect(dns.resolvePtr).to.be.calledOnce;
              verifyKerberosAuthentication(client, done);
            });
          });
        });

        context('when the reverse lookup is empty', function () {
          const resolveStub = (address, callback) => {
            callback(null, []);
          };

          beforeEach(function () {
            dns.resolvePtr.restore();
            sinon.stub(dns, 'resolvePtr').callsFake(resolveStub);
          });

          it('authenticates with a fallback cname lookup', function (done) {
            const client = new MongoClient(
              `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:${option}&maxPoolSize=1`
            );
            client.connect(function (err, client) {
              if (err) return done(err);
              // 2 calls to establish connection, 1 call in canonicalization.
              expect(dns.lookup).to.be.calledThrice;
              // This fails.
              expect(dns.resolvePtr).to.be.calledOnce;
              // Expect the fallback to the host name.
              expect(dns.resolveCname).to.not.be.called;
              verifyKerberosAuthentication(client, done);
            });
          });
        });

        context('when the reverse lookup fails', function () {
          const resolveStub = (address, callback) => {
            callback(new Error('not found'), null);
          };

          beforeEach(function () {
            dns.resolvePtr.restore();
            sinon.stub(dns, 'resolvePtr').callsFake(resolveStub);
          });

          it('authenticates with a fallback cname lookup', function (done) {
            const client = new MongoClient(
              `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:${option}&maxPoolSize=1`
            );
            client.connect(function (err, client) {
              if (err) return done(err);
              // 2 calls to establish connection, 1 call in canonicalization.
              expect(dns.lookup).to.be.calledThrice;
              // This fails.
              expect(dns.resolvePtr).to.be.calledOnce;
              // Expect the fallback to be called.
              expect(dns.resolveCname).to.be.calledOnceWith(host);
              verifyKerberosAuthentication(client, done);
            });
          });
        });

        context('when the cname lookup fails', function () {
          const resolveStub = (address, callback) => {
            callback(new Error('not found'), null);
          };

          beforeEach(function () {
            dns.resolveCname.restore();
            sinon.stub(dns, 'resolveCname').callsFake(resolveStub);
          });

          it('authenticates with a fallback host name', function (done) {
            const client = new MongoClient(
              `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:${option}&maxPoolSize=1`
            );
            client.connect(function (err, client) {
              if (err) return done(err);
              // 2 calls to establish connection, 1 call in canonicalization.
              expect(dns.lookup).to.be.calledThrice;
              // This fails.
              expect(dns.resolvePtr).to.be.calledOnce;
              // Expect the fallback to be called.
              expect(dns.resolveCname).to.be.calledOnceWith(host);
              verifyKerberosAuthentication(client, done);
            });
          });
        });

        context('when the cname lookup is empty', function () {
          const resolveStub = (address, callback) => {
            callback(null, []);
          };

          beforeEach(function () {
            dns.resolveCname.restore();
            sinon.stub(dns, 'resolveCname').callsFake(resolveStub);
          });

          it('authenticates with a fallback host name', function (done) {
            const client = new MongoClient(
              `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:${option}&maxPoolSize=1`
            );
            client.connect(function (err, client) {
              if (err) return done(err);
              // 2 calls to establish connection, 1 call in canonicalization.
              expect(dns.lookup).to.be.calledThrice;
              // This fails.
              expect(dns.resolvePtr).to.be.calledOnce;
              // Expect the fallback to be called.
              expect(dns.resolveCname).to.be.calledOnceWith(host);
              verifyKerberosAuthentication(client, done);
            });
          });
        });
      });
    }
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

  context('when passing SERVICE_HOST as an auth mech option', function () {
    context('when the SERVICE_HOST is invalid', function () {
      const client = new MongoClient(`${krb5Uri}&maxPoolSize=1`, {
        authMechanismProperties: {
          SERVICE_HOST: 'example.com'
        }
      });

      it('fails to authenticate', async function () {
        let expectedError;
        await client.connect().catch(e => {
          expectedError = e;
        });
        if (!expectedError) {
          expect.fail('Expected connect with invalid SERVICE_HOST to fail');
        }
        expect(expectedError.message).to.match(/GSS failure|UNKNOWN_SERVER/);
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
