import * as chai from 'chai';
import { promises as dns } from 'dns';
import * as sinon from 'sinon';

import { MongoClient } from '../mongodb';

const expect = chai.expect;

// eslint-disable-next-line @typescript-eslint/no-require-imports
chai.use(require('sinon-chai'));

async function verifyKerberosAuthentication(client) {
  const docs = await client.db('kerberos').collection('test').find().toArray();
  expect(docs).to.have.nested.property('[0].kerberos', true);
}

describe('Kerberos', function () {
  let resolvePtrSpy;
  let resolveCnameSpy;
  let client;

  beforeEach(() => {
    sinon.spy(dns, 'lookup');
    resolvePtrSpy = sinon.spy(dns, 'resolvePtr');
    resolveCnameSpy = sinon.spy(dns, 'resolveCname');
  });

  afterEach(function () {
    sinon.restore();
  });

  afterEach(async () => {
    await client?.close();
    client = null;
  });

  const krb5Uri = process.env.MONGODB_URI;
  const host = process.env.SASL_HOST;

  if (!process.env.PRINCIPAL) {
    console.error('skipping Kerberos tests, PRINCIPAL environment variable is not defined');
    return;
  }

  it('should authenticate with original uri', async function () {
    client = new MongoClient(krb5Uri);
    await client.connect();
    await verifyKerberosAuthentication(client);
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
      it('authenticates with a forward cname lookup', async function () {
        client = new MongoClient(
          `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:forward&maxPoolSize=1`
        );
        await client.connect();
        expect(dns.resolveCname).to.be.calledOnceWith(host);
        await verifyKerberosAuthentication(client);
      });
    });

    for (const option of [false, 'none']) {
      context(`when the value is ${option}`, function () {
        it('authenticates with no dns lookups', async function () {
          client = new MongoClient(
            `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:${option}&maxPoolSize=1`
          );
          await client.connect();
          expect(dns.resolveCname).to.not.be.called;
          // There are 2 calls to establish connection, however they use the callback form of dns.lookup
          expect(dns.lookup).to.not.be.called;
          await verifyKerberosAuthentication(client);
        });
      });
    }

    for (const option of [true, 'forwardAndReverse']) {
      context(`when the value is ${option}`, function () {
        context('when the reverse lookup succeeds', function () {
          beforeEach(function () {
            resolvePtrSpy.restore();
            sinon.stub(dns, 'resolvePtr').resolves([host]);
          });

          it('authenticates with a forward dns lookup and a reverse ptr lookup', async function () {
            client = new MongoClient(
              `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:${option}&maxPoolSize=1`
            );
            await client.connect();
            // There are 2 calls to establish connection, however they use the callback form of dns.lookup
            // 1 dns.promises.lookup call in canonicalization.
            expect(dns.lookup).to.be.calledOnce;
            expect(dns.resolvePtr).to.be.calledOnce;
            await verifyKerberosAuthentication(client);
          });
        });

        context('when the reverse lookup is empty', function () {
          beforeEach(function () {
            resolvePtrSpy.restore();
            sinon.stub(dns, 'resolvePtr').resolves([]);
          });

          it('authenticates with a fallback cname lookup', async function () {
            client = new MongoClient(
              `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:${option}&maxPoolSize=1`
            );

            await client.connect();
            // There are 2 calls to establish connection, however they use the callback form of dns.lookup
            // 1 dns.promises.lookup call in canonicalization.
            expect(dns.lookup).to.be.calledOnce;
            // This fails.
            expect(dns.resolvePtr).to.be.calledOnce;
            // Expect the fallback to the host name.
            expect(dns.resolveCname).to.not.be.called;
            await verifyKerberosAuthentication(client);
          });
        });

        context('when the reverse lookup fails', function () {
          beforeEach(function () {
            resolvePtrSpy.restore();
            sinon.stub(dns, 'resolvePtr').rejects(new Error('not found'));
          });

          it('authenticates with a fallback cname lookup', async function () {
            client = new MongoClient(
              `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:${option}&maxPoolSize=1`
            );

            await client.connect();
            // There are 2 calls to establish connection, however they use the callback form of dns.lookup
            // 1 dns.promises.lookup call in canonicalization.
            expect(dns.lookup).to.be.calledOnce;
            // This fails.
            expect(dns.resolvePtr).to.be.calledOnce;
            // Expect the fallback to be called.
            expect(dns.resolveCname).to.be.calledOnceWith(host);
            await verifyKerberosAuthentication(client);
          });
        });

        context('when the cname lookup fails', function () {
          beforeEach(function () {
            resolveCnameSpy.restore();
            sinon.stub(dns, 'resolveCname').rejects(new Error('not found'));
          });

          it('authenticates with a fallback host name', async function () {
            client = new MongoClient(
              `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:${option}&maxPoolSize=1`
            );
            await client.connect();
            // There are 2 calls to establish connection, however they use the callback form of dns.lookup
            // 1 dns.promises.lookup call in canonicalization.
            expect(dns.lookup).to.be.calledOnce;
            // This fails.
            expect(dns.resolvePtr).to.be.calledOnce;
            // Expect the fallback to be called.
            expect(dns.resolveCname).to.be.calledOnceWith(host);
            await verifyKerberosAuthentication(client);
          });
        });

        context('when the cname lookup is empty', function () {
          beforeEach(function () {
            resolveCnameSpy.restore();
            sinon.stub(dns, 'resolveCname').resolves([]);
          });

          it('authenticates with a fallback host name', async function () {
            client = new MongoClient(
              `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:${option}&maxPoolSize=1`
            );
            await client.connect();
            // There are 2 calls to establish connection, however they use the callback form of dns.lookup
            // 1 dns.promises.lookup call in canonicalization.
            expect(dns.lookup).to.be.calledOnce;
            // This fails.
            expect(dns.resolvePtr).to.be.calledOnce;
            // Expect the fallback to be called.
            expect(dns.resolveCname).to.be.calledOnceWith(host);
            await verifyKerberosAuthentication(client);
          });
        });
      });
    }
  });

  it.skip('validate that SERVICE_REALM and CANONICALIZE_HOST_NAME can be passed in', async function () {
    client = new MongoClient(
      `${krb5Uri}&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:false,SERVICE_REALM:windows&maxPoolSize=1`
    );
    await client.connect();
    await verifyKerberosAuthentication(client);
  }).skipReason = 'TODO(NODE-3060): Unskip this test when a proper setup is available';

  context('when passing SERVICE_HOST as an auth mech option', function () {
    context('when the SERVICE_HOST is invalid', function () {
      it('fails to authenticate', async function () {
        client = new MongoClient(`${krb5Uri}&maxPoolSize=1`, {
          authMechanismProperties: {
            SERVICE_HOST: 'example.com'
          }
        });

        const expectedError = await client.connect().catch(e => e);
        if (!expectedError) {
          expect.fail('Expected connect with invalid SERVICE_HOST to fail');
        }
        expect(expectedError.message).to.match(
          /GSS failure|UNKNOWN_SERVER|Server not found in Kerberos database/
        );
      });
    });

    context('when the SERVICE_HOST is valid', function () {
      it('authenticates', async function () {
        client = new MongoClient(`${krb5Uri}&maxPoolSize=1`, {
          authMechanismProperties: {
            SERVICE_HOST: 'ldaptest.10gen.cc'
          }
        });

        await client.connect();
        await verifyKerberosAuthentication(client);
      });
    });
  });

  describe('should use the SERVICE_NAME property', function () {
    it('as an option handed to the MongoClient', async function () {
      client = new MongoClient(`${krb5Uri}&maxPoolSize=1`, {
        authMechanismProperties: {
          SERVICE_NAME: 'alternate'
        }
      });

      const err = await client.connect().catch(e => e);
      expect(err.message).to.match(
        /(Error from KDC: LOOKING_UP_SERVER)|(not found in Kerberos database)|(UNKNOWN_SERVER)/
      );
    });

    it('as part of the query string parameters', async function () {
      client = new MongoClient(
        `${krb5Uri}&authMechanismProperties=SERVICE_NAME:alternate&maxPoolSize=1`
      );

      const err = await client.connect().catch(e => e);
      expect(err.message).to.match(
        /(Error from KDC: LOOKING_UP_SERVER)|(not found in Kerberos database)|(UNKNOWN_SERVER)/
      );
    });
  });

  it('should fail to authenticate with bad credentials', async function () {
    client = new MongoClient(
      krb5Uri.replace(encodeURIComponent(process.env.PRINCIPAL), 'bad%40creds.cc')
    );
    const err = await client.connect().catch(e => e);
    expect(err.message).to.match(/Authentication failed/);
  });
});
