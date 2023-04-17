import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  Collection,
  MongoClient,
  OIDC_WORKFLOWS,
  OIDCClientInfo,
  OIDCMechanismServerStep1,
  OIDCRequestTokenResult
} from '../mongodb';

describe('MONGODB-OIDC', function () {
  context('when running in the environment', function () {
    it('contains AWS_WEB_IDENTITY_TOKEN_FILE', function () {
      expect(process.env).to.have.property('AWS_WEB_IDENTITY_TOKEN_FILE');
    });
  });

  describe('OIDC Auth Spec Prose Tests', function () {
    // Set up the cache variable.
    const cache = OIDC_WORKFLOWS.get('callback').cache;
    // Creates a request function for use in the test.
    const createRequestCallback = (
      username = 'test_user1',
      expiresInSeconds?: number,
      extraFields?: any
    ) => {
      return async (clientInfo: OIDCClientInfo, serverInfo: OIDCMechanismServerStep1) => {
        const token = await readFile(path.join(process.env.OIDC_TOKEN_DIR, username), {
          encoding: 'utf8'
        });
        // Do some basic property assertions.
        expect(clientInfo).to.have.property('timeoutSeconds');
        expect(serverInfo).to.have.property('issuer');
        expect(serverInfo).to.have.property('clientId');
        return generateResult(token, expiresInSeconds, extraFields);
      };
    };

    // Creates a refresh function for use in the test.
    const createRefreshCallback = (
      username = 'test_user1',
      expiresInSeconds?: number,
      extraFields?: any
    ) => {
      return async (
        clientInfo: OIDCClientInfo,
        serverInfo: OIDCMechanismServerStep1,
        tokenResult: OIDCRequestTokenResult
      ) => {
        const token = await readFile(path.join(process.env.OIDC_TOKEN_DIR, username), {
          encoding: 'utf8'
        });
        // Do some basic property assertions.
        expect(clientInfo).to.have.property('timeoutSeconds');
        expect(serverInfo).to.have.property('issuer');
        expect(serverInfo).to.have.property('clientId');
        expect(tokenResult).to.have.property('accessToken');
        return generateResult(token, expiresInSeconds, extraFields);
      };
    };

    // Generates the result the request or refresh callback returns.
    const generateResult = (token: string, expiresInSeconds?: number, extraFields?: any) => {
      const response: OIDCRequestTokenResult = { accessToken: token };
      if (expiresInSeconds) {
        response.expiresInSeconds = expiresInSeconds;
      }
      if (extraFields) {
        return { ...response, ...extraFields };
      }
      return response;
    };

    describe('1. Callback-Driven Auth', function () {
      let client: MongoClient;
      let collection: Collection;

      beforeEach(function () {
        cache.clear();
      });

      afterEach(async function () {
        await client?.close();
      });

      describe('1.1 Single Principal Implicit Username', function () {
        before(function () {
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: createRequestCallback()
            }
          });
          collection = client.db('test').collection('test');
        });

        // Clear the cache.
        // Create a request callback returns a valid token.
        // Create a client that uses the default OIDC url and the request callback.
        // Perform a find operation. that succeeds.
        // Close the client.
        it('successfully authenticates', function () {
          expect(async () => {
            await collection.findOne();
          }).to.not.throw;
        });
      });

      describe('1.2 Single Principal Explicit Username', function () {
        before(function () {
          client = new MongoClient('mongodb://test_user@localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: createRequestCallback()
            }
          });
          collection = client.db('test').collection('test');
        });

        // Clear the cache.
        // Create a request callback that returns a valid token.
        // Create a client with a url of the form mongodb://test_user1@localhost/?authMechanism=MONGODB-OIDC and the OIDC request callback.
        // Perform a find operation that succeeds.
        // Close the client.
        it('successfully authenticates', function () {
          expect(async () => {
            await collection.findOne();
          }).to.not.throw;
        });
      });

      describe('1.3 Multiple Principal User 1', function () {
        before(function () {
          client = new MongoClient(
            'mongodb://test_user1@localhost:27018/?authMechanism=MONGODB-OIDC&directConnection=true&readPreference=secondaryPreferred',
            {
              authMechanismProperties: {
                REQUEST_TOKEN_CALLBACK: createRequestCallback()
              }
            }
          );
          collection = client.db('test').collection('test');
        });

        // Clear the cache.
        // Create a request callback that returns a valid token.
        // Create a client with a url of the form mongodb://test_user1@localhost:27018/?authMechanism=MONGODB-OIDC&directConnection=true&readPreference=secondaryPreferred and a valid OIDC request callback.
        // Perform a find operation that succeeds.
        // Close the client.
        it('successfully authenticates', function () {
          expect(async () => {
            await collection.findOne();
          }).to.not.throw;
        });
      });

      describe('1.4 Multiple Principal User 2', function () {
        before(function () {
          client = new MongoClient(
            'mongodb://test_user2@localhost:27018/?authMechanism=MONGODB-OIDC&directConnection=true&readPreference=secondaryPreferred',
            {
              authMechanismProperties: {
                REQUEST_TOKEN_CALLBACK: createRequestCallback()
              }
            }
          );
          collection = client.db('test').collection('test');
        });

        // Clear the cache.
        // Create a request callback that reads in the generated test_user2 token file.
        // Create a client with a url of the form mongodb://test_user2@localhost:27018/?authMechanism=MONGODB-OIDC&directConnection=true&readPreference=secondaryPreferred and a valid OIDC request callback.
        // Perform a find operation that succeeds.
        // Close the client.
        it('successfully authenticates', function () {
          expect(async () => {
            await collection.findOne();
          }).to.not.throw;
        });
      });

      describe('1.5  Multiple Principal No User', function () {
        before(function () {
          client = new MongoClient(
            'mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&directConnection=true&readPreference=secondaryPreferred',
            {
              authMechanismProperties: {
                REQUEST_TOKEN_CALLBACK: createRequestCallback()
              }
            }
          );
          collection = client.db('test').collection('test');
        });

        // Clear the cache.
        // Create a client with a url of the form mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&directConnection=true&readPreference=secondaryPreferred and a valid OIDC request callback.
        // Assert that a find operation fails.
        // Close the client.
        it('fails authentication', function () {
          expect(async () => {
            await collection.findOne();
          }).to.throw;
        });
      });

      describe('1.6 Allowed Hosts Blocked', function () {
        // Clear the cache.
        // Create a client that uses the OIDC url and a request callback, and an ALLOWED_HOSTS that is an empty list.
        // Assert that a find operation fails with a client-side error.
        // Close the client.
        // Create a client that uses the OIDC url and a request callback, and an ALLOWED_HOSTS that contains ["localhost1"].
        // Assert that a find operation fails with a client-side error.
        // Close the client.
      });
    });

    describe('2. AWS Automatic Auth', function () {
      let client: MongoClient;
      let collection: Collection;

      afterEach(async function () {
        await client?.close();
      });

      describe('2.1 Single Principal', function () {
        before(function () {
          client = new MongoClient(
            'mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:aws'
          );
          collection = client.db('test').collection('test');
        });

        // Create a client with a url of the form mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:aws.
        // Perform a find operation that succeeds.
        // Close the client.
        it('successfully authenticates', function () {
          expect(async () => {
            await collection.findOne();
          }).to.not.throw;
        });
      });

      describe('2.2 Multiple Principal User 1', function () {
        before(function () {
          client = new MongoClient(
            'mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:aws&directConnection=true&readPreference=secondaryPreferred'
          );
          collection = client.db('test').collection('test');
        });

        // Create a client with a url of the form mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:aws&directConnection=true&readPreference=secondaryPreferred.
        // Perform a find operation that succeeds.
        // Close the client.
        it('successfully authenticates', function () {
          expect(async () => {
            await collection.findOne();
          }).to.not.throw;
        });
      });

      describe('2.3 Multiple Principal User 2', function () {
        let tokenFile;

        before(function () {
          tokenFile = process.env.AWS_WEB_IDENTITY_TOKEN_FILE;
          process.env.AWS_WEB_IDENTITY_TOKEN_FILE = path.join(process.env.OIDC_TOKEN_DIR, 'test2');
          client = new MongoClient(
            'mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:aws&directConnection=true&readPreference=secondaryPreferred'
          );
          collection = client.db('test').collection('test');
        });

        after(function () {
          process.env.AWS_WEB_IDENTITY_TOKEN_FILE = tokenFile;
        });

        // Set the AWS_WEB_IDENTITY_TOKEN_FILE environment variable to the location of valid test_user2 credentials.
        // Create a client with a url of the form mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:aws&directConnection=true&readPreference=secondaryPreferred.
        // Perform a find operation that succeeds.
        // Close the client.
        // Restore the AWS_WEB_IDENTITY_TOKEN_FILE environment variable to the location of valid test_user2 credentials.
        it('successfully authenticates', function () {
          expect(async () => {
            await collection.findOne();
          }).to.not.throw;
        });
      });

      describe('2.4 Allowed Hosts Ignored', function () {
        before(function () {
          client = new MongoClient(
            'mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:aws',
            {
              authMechanismProperties: {
                ALLOWED_HOSTS: []
              }
            }
          );
          collection = client.db('test').collection('test');
        });

        // Create a client with a url of the form mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:aws, and an ALLOWED_HOSTS that is an empty list.
        // Assert that a find operation succeeds.
        // Close the client.
        it('successfully authenticates', function () {
          expect(async () => {
            await collection.findOne();
          }).to.not.throw;
        });
      });
    });

    describe('3. Callback Validation', function () {
      let client: MongoClient;
      let collection: Collection;

      beforeEach(function () {
        cache.clear();
      });

      afterEach(async function () {
        await client?.close();
      });

      describe('3.1 Valid Callbacks', function () {
        let requestSpy;
        let refreshSpy;

        before(function () {
          requestSpy = sinon.spy(createRequestCallback('test_user1', 60));
          refreshSpy = sinon.spy(createRefreshCallback());
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: requestSpy,
              REFRESH_TOKEN_CALLBACK: refreshSpy
            }
          });
          collection = client.db('test').collection('test');
        });

        // Clear the cache.
        // Create request and refresh callback that validate their inputs and return a valid token. The request callback must return a token that expires in one minute.
        // Create a client that uses the above callbacks.
        // Perform a find operation that succeeds. Verify that the request callback was called with the appropriate inputs, including the timeout parameter if possible. Ensure that there are no unexpected fields.
        // Perform another find operation that succeeds. Verify that the refresh callback was called with the appropriate inputs, including the timeout parameter if possible.
        // Close the client.
        it('successfully authenticates with the request and refresh callbacks', async function () {
          await collection.findOne();
          expect(requestSpy).to.have.been.calledOnce;
          await collection.findOne();
          expect(refreshSpy).to.have.been.calledOnce;
        });
      });

      describe('3.2 Request Callback Returns Null', function () {
        before(function () {
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: () => {
                return Promise.resolve(null);
              }
            }
          });
          collection = client.db('test').collection('test');
        });

        // Clear the cache.
        // Create a client with a request callback that returns null.
        // Perform a find operation that fails.
        // Close the client.
        it('fails authentication', function () {
          expect(async () => {
            await collection.findOne();
          }).to.throw;
        });
      });

      describe('3.3 Refresh Callback Returns Null', function () {
        before(function () {
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user1', 60),
              REFRESH_TOKEN_CALLBACK: () => {
                return Promise.resolve(null);
              }
            }
          });
          collection = client.db('test').collection('test');
        });

        // Clear the cache.
        // Create request callback that returns a valid token that will expire in a minute, and a refresh callback that returns null.
        // Perform a find operation that succeeds.
        // Perform a find operation that fails.
        // Close the client.
        it('fails authentication on refresh', async function () {
          await collection.findOne();
          expect(async () => {
            await collection.findOne();
          }).to.throw;
        });
      });

      describe('3.4 Request Callback Returns Invalid Data', function () {
        context('when the request callback has missing fields', function () {
          before(function () {
            client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
              authMechanismProperties: {
                REQUEST_TOKEN_CALLBACK: () => {
                  return Promise.resolve({});
                }
              }
            });
            collection = client.db('test').collection('test');
          });

          // Clear the cache.
          // Create a client with a request callback that returns data not conforming to the OIDCRequestTokenResult with missing field(s).
          // Perform a find operation that fails.
          // Close the client.
          it('fails authentication', function () {
            expect(async () => {
              await collection.findOne();
            }).to.throw;
          });
        });

        context('when the request callback has extra fields', function () {
          before(function () {
            client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
              authMechanismProperties: {
                REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user1', 60, { foo: 'bar' })
              }
            });
            collection = client.db('test').collection('test');
          });

          // Create a client with a request callback that returns data not conforming to the OIDCRequestTokenResult with extra field(s).
          // Perform a find operation that fails.
          // Close the client.
          it('fails authentication', function () {
            expect(async () => {
              await collection.findOne();
            }).to.throw;
          });
        });
      });

      describe('3.5 Refresh Callback Returns Missing Data', function () {
        before(async function () {
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user1', 60),
              REFRESH_TOKEN_CALLBACK: () => {
                return Promise.resolve({});
              }
            }
          });
          await client.db('test').collection('test').findOne();
          await client.close();
        });

        // Clear the cache.
        // Create request callback that returns a valid token that will expire in a minute, and a refresh callback that returns data not conforming to the OIDCRequestTokenResult with missing field(s).
        // Create a client with the callbacks.
        // Perform a find operation that succeeds.
        // Close the client.
        // Create a new client with the same callbacks.
        // Perform a find operation that fails.
        // Close the client.
        it('fails authentication on the refresh', function () {
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user1', 60),
              REFRESH_TOKEN_CALLBACK: () => {
                return Promise.resolve({});
              }
            }
          });
          expect(async () => {
            await client.db('test').collection('test').findOne();
          }).to.throw;
        });
      });

      describe('3.6 Refresh Callback Returns Extra Data', function () {
        before(async function () {
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user1', 60),
              REFRESH_TOKEN_CALLBACK: createRefreshCallback('test_user1', 60, { foo: 'bar' })
            }
          });
          await client.db('test').collection('test').findOne();
          await client.close();
        });

        // Clear the cache.
        // Create request callback that returns a valid token that will expire in a minute, and a refresh callback that returns data not conforming to the OIDCRequestTokenResult with extra field(s).
        // Create a client with the callbacks.
        // Perform a find operation that succeeds.
        // Close the client.
        // Create a new client with the same callbacks.
        // Perform a find operation that fails.
        // Close the client.
        it('fails authentication on the refresh', function () {
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user1', 60),
              REFRESH_TOKEN_CALLBACK: createRefreshCallback('test_user1', 60, { foo: 'bar' })
            }
          });
          expect(async () => {
            await client.db('test').collection('test').findOne();
          }).to.throw;
        });
      });
    });

    describe('4. Cached Credentials', function () {
      let client: MongoClient;
      let collection: Collection;

      beforeEach(function () {
        cache.clear();
      });

      afterEach(async function () {
        await client?.close();
      });

      describe('4.1 Cache with refresh', function () {
        let refreshSpy;

        before(async function () {
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user1', 60)
            }
          });
          await client.db('test').collection('test').findOne();
          await client.close();
          refreshSpy = sinon.spy(createRefreshCallback('test_user1', 60));
        });
        // Clear the cache.
        // Create a new client with a request callback that gives credentials that expire in on minute.
        // Ensure that a find operation adds credentials to the cache.
        // Close the client.
        // Create a new client with the same request callback and a refresh callback.
        // Ensure that a find operation results in a call to the refresh callback.
        // Close the client.
        it('successfully authenticates and calls the refresh callback', async function () {
          // Ensure credentials added to the cache.
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user1', 60),
              REFRESH_TOKEN_CALLBACK: refreshSpy
            }
          });
          await client.db('test').collection('test').findOne();
          expect(refreshSpy).to.have.been.calledOnce;
        });
      });

      describe('4.2 Cache with no refresh', function () {
        let requestSpy;

        before(async function () {
          requestSpy = sinon.spy(createRequestCallback('test_user1', 60));
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: requestSpy
            }
          });
          await client.db('test').collection('test').findOne();
          await client.close();
        });

        // Clear the cache.
        // Create a new client with a request callback that gives credentials that expire in one minute.
        // Ensure that a find operation adds credentials to the cache.
        // Close the client.
        // Create a new client with the a request callback but no refresh callback.
        // Ensure that a find operation results in a call to the request callback.
        // Close the client.
        it('successfully authenticates and calls only the request callback', async function () {
          expect(cache.entries.size).to.equal(1);
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: requestSpy
            }
          });
          await client.db('test').collection('test').findOne();
          expect(requestSpy).to.have.been.calledTwice;
        });
      });

      describe('4.3 Cache key includes callback', function () {
        const firstRequestCallback = createRequestCallback('test_user1');
        const secondRequestCallback = createRequestCallback('test_user1');

        before(async function () {
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: firstRequestCallback
            }
          });
          await client.db('test').collection('test').findOne();
          await client.close();
        });

        // Clear the cache.
        // Create a new client with a request callback that does not give an `expiresInSeconds` value.
        // Ensure that a find operation adds credentials to the cache.
        // Close the client.
        // Create a new client with a different request callback.
        // Ensure that a find operation adds a new entry to the cache.
        // Close the client.
        it('includes the callback functions in the cache', async function () {
          expect(cache.entries.size).to.equal(1);
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: secondRequestCallback
            }
          });
          await client.db('test').collection('test').findOne();
          expect(cache.entries.size).to.equal(2);
        });
      });

      describe('4.4 Error clears cache', function () {
        before(function () {
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user1', 300),
              REFRESH_TOKEN_CALLBACK: () => {
                return Promise.resolve({});
              }
            }
          });
          collection = client.db('test').collection('test');
        });

        // Clear the cache.
        // Create a new client with a valid request callback that gives credentials that expire within 5 minutes and a refresh callback that gives invalid credentials.
        // Ensure that a find operation adds a new entry to the cache.
        // Ensure that a subsequent find operation results in an error.
        // Ensure that the cached token has been cleared.
        // Close the client.
        it('clears the cache on authentication error', async function () {
          await collection.findOne();
          expect(cache.entries.size).to.equal(1);
          expect(async () => {
            await collection.findOne();
          }).to.throw;
          expect(cache.entries).to.be.empty;
        });
      });

      describe('4.5 AWS Automatic workflow does not use cache', function () {
        before(function () {
          client = new MongoClient(
            'mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:aws'
          );
          collection = client.db('test').collection('test');
        });

        // Clear the cache.
        // Create a new client that uses the AWS automatic workflow.
        // Ensure that a find operation does not add credentials to the cache.
        // Close the client.
        it('authenticates with no cache usage', async function () {
          await collection.findOne();
          expect(cache.entries).to.be.empty;
        });
      });
    });

    describe('5. Speculative Authentication', function () {
      let client: MongoClient;
      let collection: Collection;

      beforeEach(function () {
        cache.clear();
      });

      afterEach(async function () {
        await client?.close();
      });

      const setupFailPoint = async () => {
        return await client
          .db()
          .admin()
          .command({
            configureFailPoint: 'failCommand',
            mode: {
              times: 2
            },
            data: {
              failCommands: ['saslStart'],
              errorCode: 18
            }
          });
      };

      const removeFailPoint = async () => {
        return await client.db().admin().command({
          configureFailPoint: 'failCommand',
          mode: 'off'
        });
      };

      before(async function () {
        client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
          authMechanismProperties: {
            REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user1', 300)
          }
        });
        await setupFailPoint();
        collection = client.db('test').collection('test');
        await collection.findOne();
        await removeFailPoint();
      });

      // Clear the cache.
      // Create a client with a request callback that returns a valid token that will not expire soon.
      // Set a fail point for saslStart commands of the form:
      //
      // {
      //   "configureFailPoint": "failCommand",
      //   "mode": {
      //     "times": 2
      //   },
      //   "data": {
      //     "failCommands": [
      //       "saslStart"
      //     ],
      //     "errorCode": 18
      //   }
      // }
      //
      // Note
      //
      // The driver MUST either use a unique appName or explicitly remove the failCommand after the test to prevent leakage.
      //
      // Perform a find operation that succeeds.
      // Close the client.
      // Create a new client with the same properties without clearing the cache.
      // Set a fail point for saslStart commands.
      // Perform a find operation that succeeds.
      // Close the client.
      it('successfully speculative authenticates', async function () {
        client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
          authMechanismProperties: {
            REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user1', 300)
          }
        });
        await setupFailPoint();
        expect(async () => {
          await client.db('test').collection('test').findOne();
        }).to.not.throw;
        await removeFailPoint();
      });
    });

    describe('6. Reauthentication', function () {
      describe('6.1 Succeeds', function () {
        // Clear the cache.
        // Create request and refresh callbacks that return valid credentials that will not expire soon.
        // Create a client with the callbacks and an event listener. The following assumes that the driver does not emit saslStart or saslContinue events. If the driver does emit those events, ignore/filter them for the purposes of this test.
        // Perform a find operation that succeeds.
        // Assert that the refresh callback has not been called.
        // Clear the listener state if possible.
        // Force a reauthenication using a failCommand of the form:
        //
        // {
        //   "configureFailPoint": "failCommand",
        //   "mode": {
        //     "times": 1
        //   },
        //   "data": {
        //     "failCommands": [
        //       "find"
        //     ],
        //     "errorCode": 391
        //   }
        // }
        //
        // Note
        //
        // the driver MUST either use a unique appName or explicitly remove the failCommand after the test to prevent leakage.
        //
        // Perform another find operation that succeeds.
        // Assert that the refresh callback has been called once, if possible.
        // Assert that the ordering of list started events is [find], , find. Note that if the listener stat could not be cleared then there will and be extra find command.
        // Assert that the list of command succeeded events is [find].
        // Assert that a find operation failed once during the command execution.
        // Close the client.
      });

      describe('6.2 Retries and Succeeds with Cache', function () {
        // Clear the cache.
        // Create request and refresh callbacks that return valid credentials that will not expire soon.
        // Perform a find operation that succeeds.
        // Force a reauthenication using a failCommand of the form:
        //
        // {
        //   "configureFailPoint": "failCommand",
        //   "mode": {
        //     "times": 2
        //   },
        //   "data": {
        //     "failCommands": [
        //       "find", "saslStart"
        //     ],
        //     "errorCode": 391
        //   }
        // }
        //
        // Perform a find operation that succeeds.
        // Close the client.
      });

      describe('6.3 Retries and Fails with no Cache', function () {
        // Clear the cache.
        // Create request and refresh callbacks that return valid credentials that will not expire soon.
        // Perform a find operation that succeeds (to force a speculative auth).
        // Clear the cache.
        // Force a reauthenication using a failCommand of the form:
        //
        // {
        //   "configureFailPoint": "failCommand",
        //   "mode": {
        //     "times": 2
        //   },
        //   "data": {
        //     "failCommands": [
        //       "find", "saslStart"
        //     ],
        //     "errorCode": 391
        //   }
        // }
        //
        // Perform a find operation that fails.
        // Close the client.
      });
    });
  });
});
