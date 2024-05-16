import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  type Collection,
  type CommandFailedEvent,
  type CommandStartedEvent,
  type CommandSucceededEvent,
  type IdPServerInfo,
  MongoClient,
  MongoInvalidArgumentError,
  MongoMissingCredentialsError,
  MongoServerError,
  OIDC_WORKFLOWS,
  type OIDCCallbackContext
} from '../mongodb';
import { sleep } from '../tools/utils';

describe('MONGODB-OIDC', function () {
  describe('when running in the environment', function () {
    it('contains AWS_WEB_IDENTITY_TOKEN_FILE', function () {
      expect(process.env).to.have.property('AWS_WEB_IDENTITY_TOKEN_FILE');
    });
  });

  describe('OIDC Auth Spec Prose Tests', function () {
    // Set up the cache variable.
    const cache = OIDC_WORKFLOWS.get('callback').cache;
    const callbackCache = OIDC_WORKFLOWS.get('callback').callbackCache;
    // Creates a request function for use in the test.
    const createRequestCallback = (
      username = 'test_user1',
      expiresInSeconds?: number,
      extraFields?: any
    ) => {
      return async (info: IdPServerInfo, context: OIDCCallbackContext) => {
        const token = await readFile(path.join(process.env.OIDC_TOKEN_DIR, username), {
          encoding: 'utf8'
        });
        // Do some basic property assertions.
        expect(context).to.have.property('timeoutSeconds');
        expect(info).to.have.property('issuer');
        expect(info).to.have.property('clientId');
        return generateResult(token, expiresInSeconds, extraFields);
      };
    };
    // Creates a refresh function for use in the test.
    const createRefreshCallback = (
      username = 'test_user1',
      expiresInSeconds?: number,
      extraFields?: any
    ) => {
      return async (info: IdPServerInfo, context: OIDCCallbackContext) => {
        const token = await readFile(path.join(process.env.OIDC_TOKEN_DIR, username), {
          encoding: 'utf8'
        });
        // Do some basic property assertions.
        expect(context).to.have.property('timeoutSeconds');
        expect(info).to.have.property('issuer');
        expect(info).to.have.property('clientId');
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

    beforeEach(function () {
      callbackCache.clear();
    });

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
        it('successfully authenticates', async function () {
          const result = await collection.findOne();
          expect(result).to.be.null;
        });
      });

      describe('1.2 Single Principal Explicit Username', function () {
        before(function () {
          client = new MongoClient('mongodb://test_user1@localhost/?authMechanism=MONGODB-OIDC', {
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
        it('successfully authenticates', async function () {
          const result = await collection.findOne();
          expect(result).to.be.null;
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
        it('successfully authenticates', async function () {
          const result = await collection.findOne();
          expect(result).to.be.null;
        });
      });

      describe('1.4 Multiple Principal User 2', function () {
        before(function () {
          client = new MongoClient(
            'mongodb://test_user2@localhost:27018/?authMechanism=MONGODB-OIDC&directConnection=true&readPreference=secondaryPreferred',
            {
              authMechanismProperties: {
                REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user2')
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
        it('successfully authenticates', async function () {
          const result = await collection.findOne();
          expect(result).to.be.null;
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
        it('fails authentication', async function () {
          try {
            await collection.findOne();
            expect.fail('Expected OIDC auth to fail with no user provided');
          } catch (e) {
            expect(e).to.be.instanceOf(MongoServerError);
            expect(e.message).to.include('Authentication failed');
          }
        });
      });

      describe('1.6 Allowed Hosts Blocked', function () {
        before(function () {
          cache.clear();
        });
        // Clear the cache.
        // Create a client that uses the OIDC url and a request callback, and an
        // ``ALLOWED_HOSTS`` that is an empty list.
        // Assert that a ``find`` operation fails with a client-side error.
        // Close the client.
        describe('when ALLOWED_HOSTS is empty', function () {
          before(function () {
            client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
              authMechanismProperties: {
                ALLOWED_HOSTS: [],
                REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user1', 600)
              }
            });
            collection = client.db('test').collection('test');
          });

          it('fails validation', async function () {
            const error = await collection.findOne().catch(error => error);
            expect(error).to.be.instanceOf(MongoInvalidArgumentError);
            expect(error.message).to.include(
              'is not valid for OIDC authentication with ALLOWED_HOSTS'
            );
          });
        });
        // Create a client that uses the url ``mongodb://localhost/?authMechanism=MONGODB-OIDC&ignored=example.com`` a request callback, and an
        // ``ALLOWED_HOSTS`` that contains ["example.com"].
        // Assert that a ``find`` operation fails with a client-side error.
        // Close the client.
        describe('when ALLOWED_HOSTS does not match', function () {
          beforeEach(function () {
            this.currentTest.skipReason = 'Will fail URI parsing as ignored is not a valid option';
            this.skip();
            // client = new MongoClient(
            //   'mongodb://localhost/?authMechanism=MONGODB-OIDC&ignored=example.com',
            //   {
            //     authMechanismProperties: {
            //       ALLOWED_HOSTS: ['example.com'],
            //       REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user1', 600)
            //     }
            //   }
            // );
            // collection = client.db('test').collection('test');
          });

          it('fails validation', async function () {
            // try {
            //   await collection.findOne();
            // } catch (error) {
            //   expect(error).to.be.instanceOf(MongoInvalidArgumentError);
            //   expect(error.message).to.include('Host does not match provided ALLOWED_HOSTS values');
            // }
          });
        });
        // Create a client that uses the url ``mongodb://evilmongodb.com`` a request
        // callback, and an ``ALLOWED_HOSTS`` that contains ``*mongodb.com``.
        // Assert that a ``find`` operation fails with a client-side error.
        // Close the client.
        describe('when ALLOWED_HOSTS is invalid', function () {
          before(function () {
            client = new MongoClient('mongodb://evilmongodb.com/?authMechanism=MONGODB-OIDC', {
              authMechanismProperties: {
                ALLOWED_HOSTS: ['*mongodb.com'],
                REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user1', 600)
              }
            });
            collection = client.db('test').collection('test');
          });

          it('fails validation', async function () {
            const error = await collection.findOne().catch(error => error);
            expect(error).to.be.instanceOf(MongoInvalidArgumentError);
            expect(error.message).to.include(
              'is not valid for OIDC authentication with ALLOWED_HOSTS'
            );
          });
        });
      });

      describe('1.7 Lock Avoids Extra Callback Calls', function () {
        let requestCounter = 0;

        before(function () {
          cache.clear();
        });
        const requestCallback = async () => {
          requestCounter++;
          if (requestCounter > 1) {
            throw new Error('Request callback was entered simultaneously.');
          }
          const token = await readFile(path.join(process.env.OIDC_TOKEN_DIR, 'test_user1'), {
            encoding: 'utf8'
          });
          await sleep(3000);
          requestCounter--;
          return generateResult(token, 300);
        };
        const refreshCallback = createRefreshCallback();
        const requestSpy = sinon.spy(requestCallback);
        const refreshSpy = sinon.spy(refreshCallback);
        const createClient = () => {
          return new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: requestSpy,
              REFRESH_TOKEN_CALLBACK: refreshSpy
            }
          });
        };
        const authenticate = async () => {
          const client = createClient();
          await client.db('test').collection('test').findOne();
          await client.close();
        };
        const testPromise = async () => {
          await authenticate();
          await authenticate();
        };
        // Clear the cache.
        // Create a request callback that returns a token that will expire soon, and
        // a refresh callback.  Ensure that the request callback has a time delay, and
        // that we can record the number of times each callback is called.
        // Spawn two threads that do the following:
        // - Create a client with the callbacks.
        // - Run a find operation that succeeds.
        // - Close the client.
        // - Create a new client with the callbacks.
        // - Run a find operation that succeeds.
        // - Close the client.
        // Join the two threads.
        // Ensure that the request callback has been called once, and the refresh
        // callback has been called twice.
        it('does not simultaneously enter a callback', async function () {
          await Promise.all([testPromise(), testPromise()]);
          // The request callback will get called twice, but will not be entered
          // simultaneously. If it does, the function will throw and we'll have
          // and exception here.
          expect(requestSpy).to.have.been.calledTwice;
          expect(refreshSpy).to.have.been.calledTwice;
        });
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
        it('successfully authenticates', async function () {
          const result = await collection.findOne();
          expect(result).to.be.null;
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
        it('successfully authenticates', async function () {
          const result = await collection.findOne();
          expect(result).to.be.null;
        });
      });

      describe('2.3 Multiple Principal User 2', function () {
        let tokenFile;

        before(function () {
          tokenFile = process.env.AWS_WEB_IDENTITY_TOKEN_FILE;
          process.env.AWS_WEB_IDENTITY_TOKEN_FILE = path.join(
            process.env.OIDC_TOKEN_DIR,
            'test_user2'
          );
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
        it('successfully authenticates', async function () {
          const result = await collection.findOne();
          expect(result).to.be.null;
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
        it('successfully authenticates', async function () {
          const result = await collection.findOne();
          expect(result).to.be.null;
        });
      });
    });

    describe('3. Callback Validation', function () {
      let client: MongoClient;
      let collection: Collection;

      afterEach(async function () {
        await client?.close();
      });

      describe('3.1 Valid Callbacks', function () {
        const requestSpy = sinon.spy(createRequestCallback('test_user1', 60));
        const refreshSpy = sinon.spy(createRefreshCallback());
        const authMechanismProperties = {
          REQUEST_TOKEN_CALLBACK: requestSpy,
          REFRESH_TOKEN_CALLBACK: refreshSpy
        };

        before(async function () {
          cache.clear();
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: authMechanismProperties
          });
          collection = client.db('test').collection('test');
          await collection.findOne();
          expect(requestSpy).to.have.been.calledOnce;
          await client.close();
        });
        // Clear the cache.
        // Create request and refresh callback that validate their inputs and return a valid token. The request callback must return a token that expires in one minute.
        // Create a client that uses the above callbacks.
        // Perform a find operation that succeeds. Verify that the request callback was called with the appropriate inputs, including the timeout parameter if possible. Ensure that there are no unexpected fields.
        // Perform another find operation that succeeds. Verify that the refresh callback was called with the appropriate inputs, including the timeout parameter if possible.
        // Close the client.
        it('successfully authenticates with the request and refresh callbacks', async function () {
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: authMechanismProperties
          });
          collection = client.db('test').collection('test');
          await collection.findOne();
          expect(refreshSpy).to.have.been.calledOnce;
        });
      });

      describe('3.2 Request Callback Returns Null', function () {
        before(function () {
          cache.clear();
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
        it('fails authentication', async function () {
          try {
            await collection.findOne();
            expect.fail('Expected OIDC auth to fail with null return from request callback');
          } catch (e) {
            expect(e).to.be.instanceOf(MongoMissingCredentialsError);
            expect(e.message).to.include(
              'User provided OIDC callbacks must return a valid object with an accessToken'
            );
          }
        });
      });

      describe('3.3 Refresh Callback Returns Null', function () {
        const authMechanismProperties = {
          REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user1', 60),
          REFRESH_TOKEN_CALLBACK: () => {
            return Promise.resolve(null);
          }
        };

        before(async function () {
          cache.clear();
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: authMechanismProperties
          });
          collection = client.db('test').collection('test');
          await collection.findOne();
          await client.close();
        });
        // Clear the cache.
        // Create request callback that returns a valid token that will expire in a minute, and a refresh callback that returns null.
        // Perform a find operation that succeeds.
        // Perform a find operation that fails.
        // Close the client.
        it('fails authentication on refresh', async function () {
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: authMechanismProperties
          });
          try {
            await client.db('test').collection('test').findOne();
            expect.fail('Expected OIDC auth to fail with invlid return from refresh callback');
          } catch (e) {
            expect(e).to.be.instanceOf(MongoMissingCredentialsError);
            expect(e.message).to.include(
              'User provided OIDC callbacks must return a valid object with an accessToken'
            );
          }
        });
      });

      describe('3.4 Request Callback Returns Invalid Data', function () {
        describe('when the request callback has missing fields', function () {
          before(function () {
            cache.clear();
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
          it('fails authentication', async function () {
            try {
              await collection.findOne();
              expect.fail('Expected OIDC auth to fail with invlid return from request callback');
            } catch (e) {
              expect(e).to.be.instanceOf(MongoMissingCredentialsError);
              expect(e.message).to.include(
                'User provided OIDC callbacks must return a valid object with an accessToken'
              );
            }
          });
        });

        describe('when the request callback has extra fields', function () {
          before(function () {
            cache.clear();
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
          it('fails authentication', async function () {
            try {
              await collection.findOne();
              expect.fail('Expected OIDC auth to fail with extra fields from request callback');
            } catch (e) {
              expect(e).to.be.instanceOf(MongoMissingCredentialsError);
              expect(e.message).to.include(
                'User provided OIDC callbacks must return a valid object with an accessToken'
              );
            }
          });
        });
      });

      describe('3.5 Refresh Callback Returns Missing Data', function () {
        const authMechanismProperties = {
          REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user1', 60),
          REFRESH_TOKEN_CALLBACK: () => {
            return Promise.resolve({});
          }
        };

        before(async function () {
          cache.clear();
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: authMechanismProperties
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
        it('fails authentication on the refresh', async function () {
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: authMechanismProperties
          });
          try {
            await client.db('test').collection('test').findOne();
            expect.fail('Expected OIDC auth to fail with missing data from refresh callback');
          } catch (e) {
            expect(e).to.be.instanceOf(MongoMissingCredentialsError);
            expect(e.message).to.include(
              'User provided OIDC callbacks must return a valid object with an accessToken'
            );
          }
        });
      });

      describe('3.6 Refresh Callback Returns Extra Data', function () {
        const authMechanismProperties = {
          REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user1', 60),
          REFRESH_TOKEN_CALLBACK: createRefreshCallback('test_user1', 60, { foo: 'bar' })
        };

        before(async function () {
          cache.clear();
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: authMechanismProperties
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
        it('fails authentication on the refresh', async function () {
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: authMechanismProperties
          });
          try {
            await client.db('test').collection('test').findOne();
            expect.fail('Expected OIDC auth to fail with extra fields from refresh callback');
          } catch (e) {
            expect(e).to.be.instanceOf(MongoMissingCredentialsError);
            expect(e.message).to.include(
              'User provided OIDC callbacks must return a valid object with an accessToken'
            );
          }
        });
      });
    });

    describe('4. Cached Credentials', function () {
      let client: MongoClient;
      let collection: Collection;

      afterEach(async function () {
        await client?.close();
      });

      describe('4.1 Cache with refresh', function () {
        const requestCallback = createRequestCallback('test_user1', 60);
        const refreshSpy = sinon.spy(createRefreshCallback('test_user1', 60));
        const authMechanismProperties = {
          REQUEST_TOKEN_CALLBACK: requestCallback,
          REFRESH_TOKEN_CALLBACK: refreshSpy
        };

        before(async function () {
          cache.clear();
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: authMechanismProperties
          });
          await client.db('test').collection('test').findOne();
          await client.close();
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
            authMechanismProperties: authMechanismProperties
          });
          await client.db('test').collection('test').findOne();
          expect(refreshSpy).to.have.been.calledOnce;
        });
      });

      describe('4.2 Cache with no refresh', function () {
        const requestSpy = sinon.spy(createRequestCallback('test_user1', 60));

        before(async function () {
          cache.clear();
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
          cache.clear();
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
        // Ensure that a find operation replaces the one-time entry with a new entry to the cache.
        // Close the client.
        it('replaces expired entries in the cache', async function () {
          expect(cache.entries.size).to.equal(1);
          const initialKey = cache.entries.keys().next().value;
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: secondRequestCallback
            }
          });
          await client.db('test').collection('test').findOne();
          expect(cache.entries.size).to.equal(1);
          const newKey = cache.entries.keys().next().value;
          expect(newKey).to.not.equal(initialKey);
        });
      });

      describe('4.4 Error clears cache', function () {
        const authMechanismProperties = {
          REQUEST_TOKEN_CALLBACK: createRequestCallback('test_user1', 300),
          REFRESH_TOKEN_CALLBACK: () => {
            return Promise.resolve({});
          }
        };

        before(async function () {
          cache.clear();
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: authMechanismProperties
          });
          await client.db('test').collection('test').findOne();
          expect(cache.entries.size).to.equal(1);
          await client.close();
        });
        // Clear the cache.
        // Create a new client with a valid request callback that gives credentials that expire within 5 minutes and a refresh callback that gives invalid credentials.
        // Ensure that a find operation adds a new entry to the cache.
        // Ensure that a subsequent find operation results in an error.
        // Ensure that the cached token has been cleared.
        // Close the client.
        it('clears the cache on authentication error', async function () {
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: authMechanismProperties
          });
          try {
            await client.db('test').collection('test').findOne();
            expect.fail('Expected OIDC auth to fail with invalid fields from refresh callback');
          } catch (error) {
            expect(error).to.be.instanceOf(MongoMissingCredentialsError);
            expect(error.message).to.include('');
            expect(cache.entries.size).to.equal(0);
          }
        });
      });

      describe('4.5 AWS Automatic workflow does not use cache', function () {
        before(function () {
          cache.clear();
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
          expect(cache.entries.size).to.equal(0);
        });
      });
    });

    describe('5. Speculative Authentication', function () {
      let client: MongoClient;
      const requestCallback = createRequestCallback('test_user1', 600);
      const authMechanismProperties = {
        REQUEST_TOKEN_CALLBACK: requestCallback
      };
      // Removes the fail point.
      const removeFailPoint = async () => {
        return await client.db().admin().command({
          configureFailPoint: 'failCommand',
          mode: 'off'
        });
      };
      // Sets up the fail point for the saslStart
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

      afterEach(async function () {
        await removeFailPoint();
        await client?.close();
      });

      before(async function () {
        cache.clear();
        client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
          authMechanismProperties: authMechanismProperties
        });
        await setupFailPoint();
        await client.db('test').collection('test').findOne();
        await client.close();
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
          authMechanismProperties: authMechanismProperties
        });
        await setupFailPoint();
        const result = await client.db('test').collection('test').findOne();
        expect(result).to.be.null;
      });
    });

    describe('6. Reauthentication', function () {
      let client: MongoClient;
      // Removes the fail point.
      const removeFailPoint = async () => {
        return await client.db().admin().command({
          configureFailPoint: 'failCommand',
          mode: 'off'
        });
      };

      describe('6.1 Succeeds', function () {
        const requestCallback = createRequestCallback('test_user1', 600);
        const refreshSpy = sinon.spy(createRefreshCallback('test_user1', 600));
        const authMechanismProperties = {
          REQUEST_TOKEN_CALLBACK: requestCallback,
          REFRESH_TOKEN_CALLBACK: refreshSpy
        };
        const commandStartedEvents: CommandStartedEvent[] = [];
        const commandSucceededEvents: CommandSucceededEvent[] = [];
        const commandFailedEvents: CommandFailedEvent[] = [];
        const commandStartedListener = event => {
          if (event.commandName === 'find') {
            commandStartedEvents.push(event);
          }
        };
        const commandSucceededListener = event => {
          if (event.commandName === 'find') {
            commandSucceededEvents.push(event);
          }
        };
        const commandFailedListener = event => {
          if (event.commandName === 'find') {
            commandFailedEvents.push(event);
          }
        };
        const addListeners = () => {
          client.on('commandStarted', commandStartedListener);
          client.on('commandSucceeded', commandSucceededListener);
          client.on('commandFailed', commandFailedListener);
        };
        // Sets up the fail point for the find to reauthenticate.
        const setupFailPoint = async () => {
          return await client
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
        };

        before(async function () {
          cache.clear();
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: authMechanismProperties
          });
          await client.db('test').collection('test').findOne();
          expect(refreshSpy).to.not.be.called;
          client.close();
        });

        afterEach(async function () {
          await removeFailPoint();
          await client.close();
        });
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
        it('successfully reauthenticates', async function () {
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: authMechanismProperties,
            monitorCommands: true
          });
          addListeners();
          await setupFailPoint();
          await client.db('test').collection('test').findOne();
          expect(refreshSpy).to.have.been.calledOnce;
          expect(commandStartedEvents.map(event => event.commandName)).to.deep.equal([
            'find',
            'find'
          ]);
          expect(commandSucceededEvents.map(event => event.commandName)).to.deep.equal(['find']);
          expect(commandFailedEvents.map(event => event.commandName)).to.deep.equal(['find']);
        });
      });

      describe('6.2 Retries and Succeeds with Cache', function () {
        const requestCallback = createRequestCallback('test_user1', 600);
        const refreshCallback = createRefreshCallback('test_user1', 600);
        const authMechanismProperties = {
          REQUEST_TOKEN_CALLBACK: requestCallback,
          REFRESH_TOKEN_CALLBACK: refreshCallback
        };
        // Sets up the fail point for the find to reauthenticate.
        const setupFailPoint = async () => {
          return await client
            .db()
            .admin()
            .command({
              configureFailPoint: 'failCommand',
              mode: {
                times: 1
              },
              data: {
                failCommands: ['find', 'saslStart'],
                errorCode: 391
              }
            });
        };

        before(async function () {
          cache.clear();
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: authMechanismProperties
          });
          await client.db('test').collection('test').findOne();
          await setupFailPoint();
        });

        afterEach(async function () {
          await removeFailPoint();
          await client.close();
        });
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
        it('successfully authenticates', async function () {
          const result = await client.db('test').collection('test').findOne();
          expect(result).to.be.null;
        });
      });

      describe('6.3 Retries and Fails with no Cache', function () {
        const requestCallback = createRequestCallback('test_user1', 600);
        const refreshCallback = createRefreshCallback('test_user1', 600);
        const authMechanismProperties = {
          REQUEST_TOKEN_CALLBACK: requestCallback,
          REFRESH_TOKEN_CALLBACK: refreshCallback
        };
        // Sets up the fail point for the find to reauthenticate.
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
                failCommands: ['find', 'saslStart'],
                errorCode: 391
              }
            });
        };

        before(async function () {
          cache.clear();
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: authMechanismProperties
          });
          await client.db('test').collection('test').findOne();
          cache.clear();
          await setupFailPoint();
        });

        afterEach(async function () {
          await removeFailPoint();
          await client.close();
        });
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
        it('fails authentication', async function () {
          try {
            await client.db('test').collection('test').findOne();
            expect.fail('Reauthentication must fail on the saslStart error');
          } catch (error) {
            // This is the saslStart failCommand bubbled up.
            expect(error).to.be.instanceOf(MongoServerError);
          }
        });
      });
    });
  });
});
