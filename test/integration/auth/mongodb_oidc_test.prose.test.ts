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

  describe('Machine Authentication Flow Prose Tests', function () {
    const uriSingle = process.env.MONGODB_URI_SINGLE;

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
          client = new MongoClient(uriSingle, {
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
          client = new MongoClient(uriSingle, {
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
          client = new MongoClient(uriSingle, {
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
          client = new MongoClient(uriSingle, {
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
          client = new MongoClient(uriSingle, {
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
            client = new MongoClient(uriSingle, {
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
          client = new MongoClient(uriSingle, {
            authMechanismProperties: {
              OIDC_CALLBACK: callbackSpy
            }
          });
          const provider = client.s.authProviders.getOrCreateProvider(
            'MONGODB-OIDC'
          ) as MongoDBOIDC;
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
          client = new MongoClient(uriSingle, {
            authMechanismProperties: {
              OIDC_CALLBACK: callbackSpy
            }
          });
          const provider = client.s.authProviders.getOrCreateProvider(
            'MONGODB-OIDC'
          ) as MongoDBOIDC;
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
          client = new MongoClient(uriSingle, {
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

        it('successfully authenticates the second time', async function () {
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
          client = new MongoClient(uriSingle, {
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
          client = new MongoClient(uriSingle, {
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
          client = new MongoClient(uriSingle, {
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

  describe('Human Authentication Flow Prose Tests', function () {
    const uriSingle = process.env.MONGODB_URI_SINGLE;
    const uriMulti = process.env.MONGODB_URI_MULTI;

    describe('1. OIDC Human Callback Authentication', function () {
      let client: MongoClient;
      let collection: Collection;

      afterEach(async function () {
        await client?.close();
      });

      describe('1.1 Single Principal Implicit Username', function () {
        const callbackSpy = sinon.spy(createCallback());
        // Create an OIDC configured client.
        // Perform a find operation that succeeds.
        // Close the client.
        beforeEach(function () {
          client = new MongoClient(uriSingle, {
            authMechanismProperties: {
              OIDC_HUMAN_CALLBACK: callbackSpy
            }
          });
          collection = client.db('test').collection('testHuman');
        });

        it('successfully authenticates', async function () {
          const result = await collection.findOne();
          expect(result).to.be.null;
        });
      });

      describe('1.2 Single Principal Explicit Username', function () {
        const callbackSpy = sinon.spy(createCallback());
        // Create an OIDC configured client with MONGODB_URI_SINGLE and a username of test_user1@${OIDC_DOMAIN}.
        // Perform a find operation that succeeds.
        // Close the client.
        beforeEach(function () {
          client = new MongoClient(uriSingle, {
            auth: {
              username: `test_user1@${process.env.OIDC_DOMAIN}`,
              password: undefined
            },
            authMechanismProperties: {
              OIDC_HUMAN_CALLBACK: callbackSpy
            }
          });
          collection = client.db('test').collection('testHuman');
        });

        it('successfully authenticates', async function () {
          const result = await collection.findOne();
          expect(result).to.be.null;
        });
      });

      describe('1.3 Multiple Principal User 1', function () {
        const callbackSpy = sinon.spy(createCallback());
        // Create an OIDC configured client with MONGODB_URI_MULTI and username of test_user1@${OIDC_DOMAIN}.
        // Perform a find operation that succeeds.
        // Close the client.
        beforeEach(function () {
          client = new MongoClient(uriMulti, {
            auth: {
              username: `test_user1@${process.env.OIDC_DOMAIN}`,
              password: undefined
            },
            authMechanismProperties: {
              OIDC_HUMAN_CALLBACK: callbackSpy
            }
          });
          collection = client.db('test').collection('testHuman');
        });

        it('successfully authenticates', async function () {
          const result = await collection.findOne();
          expect(result).to.be.null;
        });
      });

      describe('1.4 Multiple Principal User 2', function () {
        const callbackSpy = sinon.spy(createCallback('test_user2'));
        // Create an OIDC configured client with MONGODB_URI_MULTI and username of test_user2@${OIDC_DOMAIN}. that reads the test_user2 token file.
        // Perform a find operation that succeeds.
        // Close the client.
        beforeEach(function () {
          client = new MongoClient(uriMulti, {
            auth: {
              username: `test_user2@${process.env.OIDC_DOMAIN}`,
              password: undefined
            },
            authMechanismProperties: {
              OIDC_HUMAN_CALLBACK: callbackSpy
            }
          });
          collection = client.db('test').collection('testHuman');
        });

        it('successfully authenticates', async function () {
          const result = await collection.findOne();
          expect(result).to.be.null;
        });
      });

      describe('1.5 Multiple Principal No User', function () {
        const callbackSpy = sinon.spy(createCallback(null));
        // Create an OIDC configured client with MONGODB_URI_MULTI and no username.
        // Assert that a find operation fails.
        // Close the client.
        beforeEach(function () {
          client = new MongoClient(uriMulti, {
            authMechanismProperties: {
              OIDC_HUMAN_CALLBACK: callbackSpy
            }
          });
          collection = client.db('test').collection('testHuman');
        });

        it('does not successfully authenticate', async function () {
          const error = await collection.findOne().catch(error => error);
          expect(error).to.exist;
        });
      });

      describe('1.6 Allowed Hosts Blocked', function () {
        context('when provided an empty ALLOWED_HOSTS', function () {
          const callbackSpy = sinon.spy(createCallback());
          // Create an OIDC configured client with an ALLOWED_HOSTS that is an empty list.
          // Assert that a find operation fails with a client-side error.
          // Close the client.
          beforeEach(function () {
            client = new MongoClient(uriSingle, {
              authMechanismProperties: {
                OIDC_HUMAN_CALLBACK: callbackSpy,
                ALLOWED_HOSTS: []
              }
            });
            collection = client.db('test').collection('testHuman');
          });

          it('does not successfully authenticate', async function () {
            const error = await collection.findOne().catch(error => error);
            expect(error).to.exist;
          });
        });

        context('when provided invalid ALLOWED_HOSTS', function () {
          const callbackSpy = sinon.spy(createCallback());
          // Create a client that uses the URL mongodb://localhost/?authMechanism=MONGODB-OIDC&ignored=example.com,
          //   a human callback, and an ALLOWED_HOSTS that contains ["example.com"].
          // Assert that a find operation fails with a client-side error.
          // Close the client.
          // NOTE: For Node we remove the ignored=example.com URI option as we error on unrecognised options.
          beforeEach(function () {
            client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
              authMechanismProperties: {
                OIDC_HUMAN_CALLBACK: callbackSpy,
                ALLOWED_HOSTS: ['example.com']
              }
            });
            collection = client.db('test').collection('testHuman');
          });

          it('does not successfully authenticate', async function () {
            const error = await collection.findOne().catch(error => error);
            expect(error).to.exist;
          });
        });
      });

      describe('1.7 Allowed Hosts in Connection String Ignored', function () {
        const callbackSpy = sinon.spy(createCallback());
        // Create an OIDC configured client with the connection string:
        //   mongodb+srv://example.com/?authMechanism=MONGODB-OIDC&authMechanismProperties=ALLOWED_HOSTS:%5B%22example.com%22%5D and a Human Callback.
        // Assert that the creation of the client raises a configuration error.
        it('fails on client creation', async function () {
          expect(() => {
            new MongoClient(
              `${uriSingle}&authMechanismProperties=ALLOWED_HOSTS:%5B%22example.com%22%5D`,
              {
                authMechanismProperties: {
                  OIDC_HUMAN_CALLBACK: callbackSpy
                }
              }
            );
          }).to.throw();
        });
      });

      describe('1.8 Machine IdP with Human Callback', function () {
        const callbackSpy = sinon.spy(createCallback('test_machine'));
        // This test MUST only be run when OIDC_IS_LOCAL is set. This indicates that the server is local and not using Atlas.
        //   In this case, MONGODB_URI_SINGLE will be configured with a human user test_user1, and a machine user test_machine.
        //   This test uses the machine user with a human callback, ensuring that the missing clientId in the PrincipalStepRequest
        //   response is handled by the driver.
        // Create an OIDC configured client with MONGODB_URI_SINGLE and a username of test_machine that uses the test_machine token.
        // Perform a find operation that succeeds.
        // Close the client.
        beforeEach(function () {
          client = new MongoClient(uriSingle, {
            auth: {
              username: `test_machine${process.env.OIDC_DOMAIN}`,
              password: undefined
            },
            authMechanismProperties: {
              OIDC_HUMAN_CALLBACK: callbackSpy
            }
          });
          collection = client.db('test').collection('testHuman');
        });

        it('successfully authenticates', async function () {
          const result = await collection.findOne();
          expect(result).to.be.null;
        });
      });
    });

    describe('1. OIDC Human Callback Validation', function () {
      let client: MongoClient;
      let collection: Collection;

      afterEach(async function () {
        await client?.close();
      });

      describe('2.1 Valid Callback Inputs', function () {
        const callbackSpy = sinon.spy(createCallback());
        // Create an OIDC configured client with a human callback that validates its inputs and returns a valid access token.
        // Perform a find operation that succeeds. Verify that the human callback was called with the appropriate inputs, including the timeout parameter if possible.
        // Close the client.
        beforeEach(function () {
          client = new MongoClient(uriSingle, {
            authMechanismProperties: {
              OIDC_HUMAN_CALLBACK: callbackSpy
            }
          });
          collection = client.db('test').collection('testHuman');
        });

        it('successfully authenticates', async function () {
          const result = await collection.findOne();
          expect(result).to.be.null;
        });
      });

      describe('2.2 Human Callback Returns Missing Data', function () {
        const callbackSpy = sinon.spy(() => {
          return { field: 'value' };
        });
        // Create an OIDC configured client with a human callback that returns data not conforming to the OIDCCredential with missing fields.
        // Perform a find operation that fails.
        // Close the client.
        beforeEach(function () {
          client = new MongoClient(uriSingle, {
            authMechanismProperties: {
              OIDC_HUMAN_CALLBACK: callbackSpy
            }
          });
          collection = client.db('test').collection('testHuman');
        });

        it('does not successfully authenticate', async function () {
          const error = await collection.findOne().catch(error => error);
          expect(error).to.exist;
        });
      });
    });
  });
});
