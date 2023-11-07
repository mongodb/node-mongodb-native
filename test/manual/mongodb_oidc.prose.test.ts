import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  type Collection,
  type CommandFailedEvent,
  type CommandStartedEvent,
  type CommandSucceededEvent,
  MongoClient,
  MongoInvalidArgumentError,
  MongoMissingCredentialsError,
  MongoServerError,
  type OIDCCallbackParams,
  type OIDCResponse
} from '../mongodb';

describe('OIDC Auth Spec Prose Tests', function () {
  context('when running in the environment', function () {
    it('contains AWS_WEB_IDENTITY_TOKEN_FILE', function () {
      expect(process.env).to.have.property('AWS_WEB_IDENTITY_TOKEN_FILE');
    });
  });

  describe('1. Callback Authentication', function () {
    // Creates a request function for use in the test.
    const createRequestCallback = (
      username = 'test_user1',
      expiresInSeconds?: number,
      extraFields?: any
    ) => {
      return async (params: OIDCCallbackParams) => {
        const token = await readFile(path.join(process.env.OIDC_TOKEN_DIR, username), {
          encoding: 'utf8'
        });
        // Do some basic property assertions.
        expect(params).to.have.property('timeoutContext');
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

    describe('1. Callback-Driven Auth', function () {
      let client: MongoClient;
      let collection: Collection;

      afterEach(async function () {
        await client?.close();
      });

      describe('1.1 Single Principal Implicit Username', function () {
        before(function () {
          // Create the default OIDC client.
          client = new MongoClient(`${process.env.MONGODB_URI_SINGLE}?authMechanism=MONGODB-OIDC`, {
            authMechanismProperties: {
              OIDC_CALLBACK: createRequestCallback()
            }
          });
          collection = client.db('test').collection('nodeOidcTest');
        });

        // Close the client.
        it('successfully authenticates', async function () {
          const result = await collection.findOne();
          expect(result).to.be.null;
        });
      });

      describe('1.2 Single Principal Explicit Username', function () {
        before(function () {
          // Create a client with ``MONGODB_URI_SINGLE``, a username of ``test_user1``, and the OIDC request callback.
          const url = new URL(process.env.MONGODB_URI_SINGLE);
          url.username = 'test_user1';
          url.searchParams.set('authMechanism', 'MONGODB-OIDC');
          client = new MongoClient(url.toString(), {
            authMechanismProperties: {
              OIDC_CALLBACK: createRequestCallback()
            }
          });
          collection = client.db('test').collection('nodeOidcTest');
        });

        // Perform a find operation that succeeds.
        // Close the client.
        it('successfully authenticates', async function () {
          const result = await collection.findOne();
          expect(result).to.be.null;
        });
      });

      describe('1.3 Multiple Principal User 1', function () {
        before(function () {
          // Create a client with ``MONGODB_URI_MULTI``, a username of ``test_user1``, and the OIDC request callback.
          const url = new URL(process.env.MONGODB_URI_MULTI);
          url.username = 'test_user1';
          url.searchParams.set('authMechanism', 'MONGODB-OIDC');
          client = new MongoClient(url.toString(), {
            authMechanismProperties: {
              OIDC_CALLBACK: createRequestCallback()
            }
          });
          collection = client.db('test').collection('nodeOidcTest');
        });

        // Perform a find operation that succeeds.
        // Close the client.
        it('successfully authenticates', async function () {
          const result = await collection.findOne();
          expect(result).to.be.null;
        });
      });

      describe('1.4 Multiple Principal User 2', function () {
        before(function () {
          // Create a client with ``MONGODB_URI_MULTI``, a username of ``test_user2``, and the OIDC request callback.
          const url = new URL(process.env.MONGODB_URI_MULTI);
          url.username = 'test_user2';
          url.searchParams.set('authMechanism', 'MONGODB-OIDC');
          client = new MongoClient(url.toString(), {
            authMechanismProperties: {
              OIDC_CALLBACK: createRequestCallback('test_user2')
            }
          });
          collection = client.db('test').collection('nodeOidcTest');
        });

        // Perform a find operation that succeeds.
        // Close the client.
        it('successfully authenticates', async function () {
          const result = await collection.findOne();
          expect(result).to.be.null;
        });
      });

      describe('1.5  Multiple Principal No User', function () {
        before(function () {
          // Create a client with ``MONGODB_URI_MULTI``, no username, and the OIDC request callback.
          client = new MongoClient(`${process.env.MONGODB_URI_MULTI}?authMechanism=MONGODB-OIDC`, {
            authMechanismProperties: {
              OIDC_CALLBACK: createRequestCallback()
            }
          });
          collection = client.db('test').collection('nodeOidcTest');
        });

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
        // Assert that a ``find`` operation fails with a client-side error.
        // Close the client.
        context('when ALLOWED_HOSTS is empty', function () {
          before(function () {
            // Create a default OIDC client, with an ``ALLOWED_HOSTS`` that is an empty list.
            client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
              authMechanismProperties: {
                ALLOWED_HOSTS: [],
                OIDC_CALLBACK: createRequestCallback()
              }
            });
            collection = client.db('test').collection('nodeOidcTest');
          });

          // Assert that a ``find`` operation fails with a client-side error.
          // Close the client.
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
        context('when ALLOWED_HOSTS does not match', function () {
          beforeEach(function () {
            this.currentTest.skipReason = 'Will fail URI parsing as ignored is not a valid option';
            this.skip();
            // client = new MongoClient(
            //   'mongodb://localhost/?authMechanism=MONGODB-OIDC&ignored=example.com',
            //   {
            //     authMechanismProperties: {
            //       ALLOWED_HOSTS: ['example.com'],
            //       OIDC_CALLBACK: createRequestCallback('test_user1', 600)
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
        context('when ALLOWED_HOSTS is invalid', function () {
          before(function () {
            client = new MongoClient('mongodb://evilmongodb.com/?authMechanism=MONGODB-OIDC', {
              authMechanismProperties: {
                ALLOWED_HOSTS: ['*mongodb.com'],
                OIDC_CALLBACK: createRequestCallback('test_user1', 600)
              }
            });
            collection = client.db('test').collection('nodeOidcTest');
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
            'mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=ENVIRONMENT:aws'
          );
          collection = client.db('test').collection('nodeOidcTest');
        });

        // Create a client with a url of the form mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=ENVIRONMENT:aws.
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
            'mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&authMechanismProperties=ENVIRONMENT:aws&directConnection=true&readPreference=secondaryPreferred'
          );
          collection = client.db('test').collection('nodeOidcTest');
        });

        // Create a client with a url of the form mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&authMechanismProperties=ENVIRONMENT:aws&directConnection=true&readPreference=secondaryPreferred.
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
            'mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&authMechanismProperties=ENVIRONMENT:aws&directConnection=true&readPreference=secondaryPreferred'
          );
          collection = client.db('test').collection('nodeOidcTest');
        });

        after(function () {
          process.env.AWS_WEB_IDENTITY_TOKEN_FILE = tokenFile;
        });

        // Set the AWS_WEB_IDENTITY_TOKEN_FILE environment variable to the location of valid test_user2 credentials.
        // Create a client with a url of the form mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&authMechanismProperties=ENVIRONMENT:aws&directConnection=true&readPreference=secondaryPreferred.
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
            'mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=ENVIRONMENT:aws',
            {
              authMechanismProperties: {
                ALLOWED_HOSTS: []
              }
            }
          );
          collection = client.db('test').collection('nodeOidcTest');
        });

        // Create a client with a url of the form mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=ENVIRONMENT:aws, and an ALLOWED_HOSTS that is an empty list.
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
        // Create request callback that validates its inputs and returns a valid token.
        const requestSpy = sinon.spy(createRequestCallback('test_user1', 60));
        const authMechanismProperties = {
          OIDC_CALLBACK: requestSpy
        };

        before(async function () {
          // Create a client that uses the above callbacks.
          client = new MongoClient(`${process.env.MONGODB_URI_SINGLE}?authMechanism=MONGODB-OIDC`, {
            authMechanismProperties: authMechanismProperties
          });
          collection = client.db('test').collection('nodeOidcTest');
        });

        // Perform a find operation that succeeds. Verify that the request callback was called with the
        //   appropriate inputs, including the timeout parameter if possible. Ensure that there are no unexpected fields.
        // Close the client.
        it('successfully authenticates with the request and refresh callbacks', async function () {
          await collection.findOne();
          expect(requestSpy).to.have.been.calledOnce;
        });
      });

      describe('3.2 Request Callback Returns Null', function () {
        before(function () {
          // Create a client with a request callback that returns null.
          client = new MongoClient(`${process.env.MONGODB_URI_SINGLE}?authMechanism=MONGODB-OIDC`, {
            authMechanismProperties: {
              OIDC_CALLBACK: () => {
                return Promise.resolve(null);
              }
            }
          });
          collection = client.db('test').collection('nodeOidcTest');
        });

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

      describe('3.4 Request Callback Returns Invalid Data', function () {
        context('when the request callback has missing fields', function () {
          before(function () {
            // Create a client with a request callback that returns data not conforming to
            //   the OIDCRequestTokenResult with missing field(s).
            client = new MongoClient(
              `${process.env.MONGODB_URI_SINGLE}?authMechanism=MONGODB-OIDC`,
              {
                authMechanismProperties: {
                  OIDC_CALLBACK: () => {
                    return Promise.resolve({});
                  }
                }
              }
            );
            collection = client.db('test').collection('nodeOidcTest');
          });

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
      });
    });

    describe('4. Speculative Authentication', function () {
      let client: MongoClient;
      const requestCallback = createRequestCallback('test_user1', 600);
      const authMechanismProperties = {
        OIDC_CALLBACK: requestCallback
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
        // Create a client with a request callback that returns a valid token.
        client = new MongoClient(`${process.env.MONGODB_URI_SINGLE}?authMechanism=MONGODB-OIDC`, {
          authMechanismProperties: authMechanismProperties
        });
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
        await setupFailPoint();
      });

      // Perform a find operation that succeeds.
      // Close the client.
      it('successfully speculative authenticates', async function () {
        const result = await client.db('test').collection('nodeOidcTest').findOne();
        expect(result).to.be.null;
      });
    });

    describe('5. Reauthentication', function () {
      let client: MongoClient;

      // Removes the fail point.
      const removeFailPoint = async () => {
        return await client.db().admin().command({
          configureFailPoint: 'failCommand',
          mode: 'off'
        });
      };

      describe('5.1 Succeeds', function () {
        const requestSpy = sinon.spy(createRequestCallback('test_user1', 60));
        const authMechanismProperties = {
          OIDC_CALLBACK: requestSpy
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
          // Create a default OIDC client and an event listener. The following assumes that the driver does not
          //   emit saslStart or saslContinue events. If the driver does emit those events,
          //   ignore/filter them for the purposes of this test.
          client = new MongoClient(`${process.env.MONGODB_URI_SINGLE}?authMechanism=MONGODB-OIDC`, {
            authMechanismProperties: authMechanismProperties,
            monitorCommands: true
          });
          // Perform a find operation that succeeds.
          // Assert that the request callback has been called once.
          // Clear the listener state if possible.
          await client.db('test').collection('nodeOidcTest').findOne();
          expect(requestSpy).to.have.been.calledOnce;
        });

        afterEach(async function () {
          await removeFailPoint();
          await client.close();
        });

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
        // Assert that the request callback has been called twice.
        // Assert that the ordering of list started events is [find], , find. Note that if the listener stat could not be cleared then there will and be extra find command.
        // Assert that the list of command succeeded events is [find].
        // Assert that a find operation failed once during the command execution.
        // Close the client.
        it('successfully reauthenticates', async function () {
          await setupFailPoint();
          addListeners();
          await client.db('test').collection('nodeOidcTest').findOne();
          expect(requestSpy).to.have.been.calledTwice;
          expect(commandStartedEvents.map(event => event.commandName)).to.deep.equal([
            'find',
            'find'
          ]);
          expect(commandSucceededEvents.map(event => event.commandName)).to.deep.equal(['find']);
          expect(commandFailedEvents.map(event => event.commandName)).to.deep.equal(['find']);
        });
      });

      describe('5.2 Succeeds no refresh', function () {
        const requestCallback = createRequestCallback('test_user1', 600);
        const requestSpy = sinon.spy(requestCallback);
        const authMechanismProperties = {
          OIDC_CALLBACK: requestSpy
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
          // Create a default OIDC client with a request callback that does not return a refresh token.
          client = new MongoClient(`${process.env.MONGODB_URI_SINGLE}?authMechanism=MONGODB-OIDC`, {
            authMechanismProperties: authMechanismProperties
          });
          // Perform a ``find`` operation that succeeds.
          // Assert that the request callback has been called once.
          await client.db('test').collection('nodeOidcTest').findOne();
          expect(requestSpy).to.have.been.calledOnce;
          await setupFailPoint();
        });

        afterEach(async function () {
          await removeFailPoint();
          await client.close();
        });

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
        // Perform a find operation that succeeds.
        // Assert that the request callback has been called twice.
        // Close the client.
        it('successfully authenticates', async function () {
          const result = await client.db('test').collection('nodeOidcTest').findOne();
          expect(requestSpy).to.have.been.calledTwice;
          expect(result).to.be.null;
        });
      });

      describe('5.3 Succeeds after refresh fails', function () {
        const requestCallback = createRequestCallback('test_user1', 600);
        const requestSpy = sinon.spy(requestCallback);
        const authMechanismProperties = {
          OIDC_CALLBACK: requestSpy
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
                failCommands: ['find', 'saslContinue'],
                errorCode: 391
              }
            });
        };

        before(async function () {
          // Create a default OIDC client.
          client = new MongoClient(`${process.env.MONGODB_URI_SINGLE}?authMechanism=MONGODB-OIDC`, {
            authMechanismProperties: authMechanismProperties
          });
          // Perform a ``find`` operation that succeeds.
          // Assert that the request callback has been called once.
          await client.db('test').collection('nodeOidcTest').findOne();
          expect(requestSpy).to.have.been.calledOnce;
          await setupFailPoint();
        });

        afterEach(async function () {
          await removeFailPoint();
          await client.close();
        });

        // Force a reauthenication using a failCommand of the form:
        //
        // {
        //   "configureFailPoint": "failCommand",
        //   "mode": {
        //     "times": 2
        //   },
        //   "data": {
        //     "failCommands": [
        //       "find", "saslContinue"
        //     ],
        //     "errorCode": 391
        //   }
        // }
        //
        // Perform a find operation that succeeds.
        // Assert that the request callback has been called three times.
        // Close the client.
        it('successfully authenticates', async function () {
          const result = await client.db('test').collection('nodeOidcTest').findOne();
          expect(requestSpy).to.have.been.calledThrice;
          expect(result).to.be.null;
        });
      });

      describe('5.3 Fails', function () {
        const requestCallback = createRequestCallback('test_user1', 600);
        const requestSpy = sinon.spy(requestCallback);
        const authMechanismProperties = {
          OIDC_CALLBACK: requestSpy
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
          // Create a default OIDC client.
          client = new MongoClient(`${process.env.MONGODB_URI_SINGLE}?authMechanism=MONGODB-OIDC`, {
            authMechanismProperties: authMechanismProperties
          });
          // Perform a find operation that succeeds (to force a speculative auth).
          // Assert that the request callback has been called once.
          await client.db('test').collection('nodeOidcTest').findOne();
          expect(requestSpy).to.have.been.calledOnce;
          await setupFailPoint();
        });

        afterEach(async function () {
          await removeFailPoint();
          await client.close();
        });

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
        // Assert that the request callback has been called twice.
        // Close the client.
        it('fails authentication', async function () {
          try {
            await client.db('test').collection('nodeOidcTest').findOne();
            expect.fail('Reauthentication must fail on the saslStart error');
          } catch (error) {
            // This is the saslStart failCommand bubbled up.
            expect(error).to.be.instanceOf(MongoServerError);
            expect(requestSpy).to.have.been.calledTwice;
          }
        });
      });
    });
    // describe('6. Separate Connections Avoid Extra Callback Calls', function () {});
  });
});
