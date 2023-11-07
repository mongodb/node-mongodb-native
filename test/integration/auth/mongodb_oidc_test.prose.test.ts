import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  type Collection,
  MongoClient,
  type MongoDBOIDC,
  type OIDCCallbackParams,
  type OIDCResponse
} from '../../mongodb';

const DEFAULT_URI = 'mongodb://127.0.0.1:27017';

const createCallback = (tokenFile = 'test_user1', expiresInSeconds?: number, extraFields?: any) => {
  return async (params: OIDCCallbackParams) => {
    const token = await readFile(path.join(process.env.OIDC_TOKEN_DIR, tokenFile), {
      encoding: 'utf8'
    });
    // Assert the correct properties are set.
    expect(params).to.have.property('timeoutContext');
    expect(params).to.have.property('version');
    return generateResult(token, expiresInSeconds, extraFields);
  };
};

// Generates the result the request or refresh callback returns.
const generateResult = (token: string, expiresInSeconds?: number, extraFields?: any) => {
  const response: OIDCResponse = { accessToken: token };
  if (expiresInSeconds) {
    response.expiresInSeconds = expiresInSeconds;
  }
  if (extraFields) {
    return { ...response, ...extraFields };
  }
  return response;
};

describe('OIDC Auth Spec Tests', function () {
  beforeEach(function () {
    if (process.env.ENVIRONMENT !== 'test') {
      this.skipReason = 'GCP OIDC prose tests require a Test OIDC environment.';
      this.skip();
    }
  });

  describe('1. Callback Authentication', function () {
    let client: MongoClient;
    let collection: Collection;

    afterEach(async function () {
      await client?.close();
    });

    describe('1.1 Callback is called during authentication', function () {
      const callbackSpy = sinon.spy(createCallback());
      // Create an OIDC configured client.
      // Perform a find operation that succeeds.
      // Assert that the callback was called 1 time.
      // Close the client.
      beforeEach(function () {
        client = new MongoClient(process.env.MONGODB_URI_SINGLE ?? DEFAULT_URI, {
          authMechanismProperties: {
            OIDC_CALLBACK: callbackSpy
          }
        });
        collection = client.db('test').collection('test');
      });

      it('successfully authenticates', async function () {
        await collection.findOne();
        expect(callbackSpy).to.have.been.calledOnce;
      });
    });

    describe('1.2 Callback is called once for multiple connections', function () {
      const callbackSpy = sinon.spy(createCallback());
      // Create an OIDC configured client.
      // Start 10 threads and run 100 find operations in each thread that all succeed.
      // Assert that the callback was called 1 time.
      // Close the client.
      beforeEach(function () {
        client = new MongoClient(process.env.MONGODB_URI_SINGLE ?? DEFAULT_URI, {
          authMechanismProperties: {
            OIDC_CALLBACK: callbackSpy
          }
        });
        collection = client.db('test').collection('test');
      });

      it('only calls the callback once', async function () {
        for (let i = 0; i < 100; i++) {
          await collection.findOne();
        }
        expect(callbackSpy).to.have.been.calledOnce;
      });
    });
  });

  describe('2. OIDC Callback Validation', function () {
    let client: MongoClient;
    let collection: Collection;

    afterEach(async function () {
      await client?.close();
    });

    describe('2.1 Valid Callback Inputs', function () {
      const callbackSpy = sinon.spy(createCallback());
      // Create an OIDC configured client with an OIDC callback that validates its inputs and returns a valid access token.
      // Perform a find operation that succeeds.
      // Assert that the OIDC callback was called with the appropriate inputs, including the timeout parameter if possible.
      // Close the client.
      beforeEach(function () {
        client = new MongoClient(process.env.MONGODB_URI_SINGLE ?? DEFAULT_URI, {
          authMechanismProperties: {
            OIDC_CALLBACK: callbackSpy
          }
        });
        collection = client.db('test').collection('test');
      });

      it('successfully authenticates', async function () {
        await collection.findOne();
        // IdpInfo can change, so we assert we called once and validate existence in the callback itself.
        expect(callbackSpy).to.have.been.calledOnce;
      });
    });

    describe('2.2 OIDC Callback Returns Null', function () {
      const callbackSpy = sinon.spy(() => null);
      // Create an OIDC configured client with an OIDC callback that returns null.
      // Perform a find operation that fails.
      // Close the client.
      beforeEach(function () {
        client = new MongoClient(process.env.MONGODB_URI_SINGLE ?? DEFAULT_URI, {
          authMechanismProperties: {
            OIDC_CALLBACK: callbackSpy
          }
        });
        collection = client.db('test').collection('test');
      });

      it('does not successfully authenticate', async function () {
        const error = await collection.findOne().catch(error => error);
        expect(error).to.exist;
      });
    });

    describe('2.3 OIDC Callback Returns Missing Data', function () {
      const callbackSpy = sinon.spy(() => {
        return { field: 'value' };
      });
      // Create an OIDC configured client with an OIDC callback that returns data not conforming to the OIDCCredential with missing fields.
      // Perform a find operation that fails.
      // Close the client.
      beforeEach(function () {
        client = new MongoClient(process.env.MONGODB_URI_SINGLE ?? DEFAULT_URI, {
          authMechanismProperties: {
            OIDC_CALLBACK: callbackSpy
          }
        });
        collection = client.db('test').collection('test');
      });

      it('does not successfully authenticate', async function () {
        const error = await collection.findOne().catch(error => error);
        expect(error).to.exist;
      });
    });

    describe('2.4 Invalid Client Configuration with Callback', function () {
      const callbackSpy = sinon.spy(createCallback());
      // Create an OIDC configured client with an OIDC callback and auth mechanism property ENVIRONMENT:test.
      // Assert it returns a client configuration error.
      it('fails validation', async function () {
        try {
          client = new MongoClient(process.env.MONGODB_URI_SINGLE ?? DEFAULT_URI, {
            authMechanismProperties: {
              OIDC_CALLBACK: callbackSpy,
              ENVIRONMENT: 'test'
            }
          });
        } catch (error) {
          expect(error).to.exist;
        }
      });
    });
  });

  describe('3. Authentication Failure', function () {
    let client: MongoClient;
    let collection: Collection;

    afterEach(async function () {
      await client?.close();
    });

    describe('3.1 Authentication failure with cached tokens fetch a new token and retry auth', function () {
      const callbackSpy = sinon.spy(createCallback());
      // Create an OIDC configured client.
      // Poison the Client Cache with an invalid access token.
      // Perform a find operation that succeeds.
      // Assert that the callback was called 1 time.
      // Close the client.
      beforeEach(function () {
        client = new MongoClient(process.env.MONGODB_URI_SINGLE ?? DEFAULT_URI, {
          authMechanismProperties: {
            OIDC_CALLBACK: callbackSpy
          }
        });
        const provider = client.s.authProviders.getOrCreateProvider('MONGODB-OIDC') as MongoDBOIDC;
        provider.cache.put({ idpServerResponse: { accessToken: 'bad' } });
        collection = client.db('test').collection('test');
      });

      it('successfully authenticates', async function () {
        await collection.findOne();
        expect(callbackSpy).to.have.been.calledOnce;
      });
    });

    describe('3.2 Authentication failures without cached tokens return an error', function () {
      const callbackSpy = sinon.spy(() => {
        return { accessToken: 'bad' };
      });
      // Create an OIDC configured client with an OIDC callback that always returns invalid access tokens.
      // Perform a find operation that fails.
      // Assert that the callback was called 1 time.
      // Close the client.
      beforeEach(function () {
        client = new MongoClient(process.env.MONGODB_URI_SINGLE ?? DEFAULT_URI, {
          authMechanismProperties: {
            OIDC_CALLBACK: callbackSpy
          }
        });
        const provider = client.s.authProviders.getOrCreateProvider('MONGODB-OIDC') as MongoDBOIDC;
        provider.cache.put({ idpServerResponse: { accessToken: 'bad' } });
        collection = client.db('test').collection('test');
      });

      it('does not successfully authenticate', async function () {
        const error = await collection.findOne().catch(error => error);
        expect(error).to.exist;
        expect(callbackSpy).to.have.been.calledOnce;
      });
    });

    describe('3.3 Unexpected error code does not clear the cache', function () {
      const callbackSpy = sinon.spy(createCallback());
      // Create a MongoClient with a callback that returns a valid token.
      // Set a fail point for saslStart commands of the form:
      // {
      //   configureFailPoint: "failCommand",
      //   mode: {
      //     times: 1
      //   },
      //   data: {
      //     failCommands: [
      //       "saslStart"
      //     ],
      //     errorCode: 20 // IllegalOperation
      //   }
      // }
      // Perform a find operation that fails.
      // Assert that the callback has been called once.
      // Perform a find operation that succeeds.
      // Assert that the callback has been called once.
      // Close the client.
      beforeEach(async function () {
        client = new MongoClient(process.env.MONGODB_URI_SINGLE ?? DEFAULT_URI, {
          authMechanismProperties: {
            OIDC_CALLBACK: callbackSpy
          }
        });
        collection = client.db('test').collection('test');
        await client
          .db()
          .admin()
          .command({
            configureFailPoint: 'failCommand',
            mode: {
              times: 1
            },
            data: {
              failCommands: ['saslStart'],
              errorCode: 20
            }
          });
      });

      afterEach(async function () {
        await client.db().admin().command({
          configureFailPoint: 'failCommand',
          mode: 'off'
        });
      });

      it('successfully authenticates', async function () {
        const error = await collection.findOne().catch(error => error);
        expect(error).to.exist;
        expect(callbackSpy).to.have.been.calledOnce;
        await collection.findOne();
        expect(callbackSpy).to.have.been.calledOnce;
      });
    });
  });

  describe('4. Reauthentication', function () {
    let client: MongoClient;
    let collection: Collection;
    let callbackCount = 0;

    afterEach(async function () {
      callbackCount = 0;
      await client?.close();
    });

    const createBadCallback = () => {
      return async () => {
        if (callbackCount === 0) {
          const token = await readFile(path.join(process.env.OIDC_TOKEN_DIR, 'test_user1'), {
            encoding: 'utf8'
          });
          callbackCount++;
          return generateResult(token);
        }
        return generateResult('bad');
      };
    };

    describe('4.1 Reauthentication Succeeds', function () {
      const callbackSpy = sinon.spy(createCallback());
      // Create an OIDC configured client.
      // Set a fail point for find commands of the form:
      // {
      //   configureFailPoint: "failCommand",
      //   mode: {
      //     times: 1
      //   },
      //   data: {
      //     failCommands: [
      //       "find"
      //     ],
      //     errorCode: 391 // ReauthenticationRequired
      //   }
      // }
      // Perform a find operation that succeeds.
      // Assert that the callback was called 2 times (once during the connection handshake, and again during reauthentication).
      // Close the client.
      beforeEach(async function () {
        client = new MongoClient(process.env.MONGODB_URI_SINGLE ?? DEFAULT_URI, {
          authMechanismProperties: {
            OIDC_CALLBACK: callbackSpy
          }
        });
        collection = client.db('test').collection('test');
        await client
          .db()
          .admin()
          .command({
            configureFailPoint: 'failCommand',
            mode: {
              times: 1
            },
            data: {
              failCommands: ['find'],
              errorCode: 391
            }
          });
      });

      afterEach(async function () {
        await client.db().admin().command({
          configureFailPoint: 'failCommand',
          mode: 'off'
        });
      });

      it('successfully authenticates', async function () {
        await collection.findOne();
        expect(callbackSpy).to.have.been.calledTwice;
      });
    });

    describe('4.2 Read Commands Fail If Reauthentication Fails', function () {
      const callbackSpy = sinon.spy(createBadCallback());
      // Create a MongoClient whose OIDC callback returns one good token and then bad tokens after the first call.
      // Perform a find operation that succeeds.
      // Set a fail point for find commands of the form:
      // {
      //   configureFailPoint: "failCommand",
      //   mode: {
      //     times: 1
      //   },
      //   data: {
      //     failCommands: [
      //       "find"
      //     ],
      //     errorCode: 391 // ReauthenticationRequired
      //   }
      // }
      // Perform a find operation that fails.
      // Assert that the callback was called 2 times.
      // Close the client.
      beforeEach(async function () {
        client = new MongoClient(process.env.MONGODB_URI_SINGLE ?? DEFAULT_URI, {
          authMechanismProperties: {
            OIDC_CALLBACK: callbackSpy
          }
        });
        collection = client.db('test').collection('test');
        await client
          .db()
          .admin()
          .command({
            configureFailPoint: 'failCommand',
            mode: {
              times: 1
            },
            data: {
              failCommands: ['find'],
              errorCode: 391
            }
          });
      });

      afterEach(async function () {
        await client.db().admin().command({
          configureFailPoint: 'failCommand',
          mode: 'off'
        });
      });

      it('does not successfully authenticate', async function () {
        const error = await collection.findOne().catch(error => error);
        expect(error).to.exist;
        expect(callbackSpy).to.have.been.calledTwice;
      });
    });

    describe('4.3 Write Commands Fail If Reauthentication Fails', function () {
      const callbackSpy = sinon.spy(createBadCallback());
      // Create a MongoClient whose OIDC callback returns one good token and then bad tokens after the first call.
      // Perform an insert operation that succeeds.
      // Set a fail point for insert commands of the form:
      // {
      //   configureFailPoint: "failCommand",
      //   mode: {
      //     times: 1
      //   },
      //   data: {
      //     failCommands: [
      //       "insert"
      //     ],
      //     errorCode: 391 // ReauthenticationRequired
      //   }
      // }
      // Perform an insert operation that fails.
      // Assert that the callback was called 2 times.
      // Close the client.
      beforeEach(async function () {
        client = new MongoClient(process.env.MONGODB_URI_SINGLE ?? DEFAULT_URI, {
          authMechanismProperties: {
            OIDC_CALLBACK: callbackSpy
          }
        });
        collection = client.db('test').collection('test');
        await collection.insertOne({ n: 1 });
        await client
          .db()
          .admin()
          .command({
            configureFailPoint: 'failCommand',
            mode: {
              times: 1
            },
            data: {
              failCommands: ['insert'],
              errorCode: 391
            }
          });
      });

      afterEach(async function () {
        await client.db().admin().command({
          configureFailPoint: 'failCommand',
          mode: 'off'
        });
      });

      it('does not successfully authenticate', async function () {
        const error = await collection.insertOne({ n: 2 }).catch(error => error);
        expect(error).to.exist;
        expect(callbackSpy).to.have.been.calledTwice;
      });
    });
  });
});
