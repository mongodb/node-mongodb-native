import { expect } from 'chai';

import {
  type Collection,
  type CommandFailedEvent,
  type CommandStartedEvent,
  type CommandSucceededEvent,
  type MongoClient,
  OIDC_WORKFLOWS
} from '../../mongodb';

describe('OIDC Auth Spec Prose Tests', function () {
  const callbackCache = OIDC_WORKFLOWS.get('callback').cache;
  const azureCache = OIDC_WORKFLOWS.get('azure').cache;

  describe('3. Azure Automatic Auth', function () {
    let client: MongoClient;
    let collection: Collection;

    beforeEach(function () {
      if (!this.configuration.isAzureOIDC(process.env.MONGODB_URI)) {
        this.skipReason = 'Azure OIDC prose tests require an Azure OIDC environment.';
        this.skip();
      }
    });

    afterEach(async function () {
      await client?.close();
    });

    describe('3.1 Connect', function () {
      beforeEach(function () {
        client = this.configuration.newClient(process.env.MONGODB_URI);
        collection = client.db('test').collection('test');
      });
      // Create a client with a url of the form mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:azure,TOKEN_AUDIENCE:<foo>.
      // Assert that a find operation succeeds.
      // Close the client.
      it('successfully authenticates', async function () {
        const result = await collection.findOne();
        expect(result).to.be.null;
      });
    });

    describe('3.2 Allowed Hosts Ignored', function () {
      beforeEach(function () {
        client = this.configuration.newClient(process.env.MONGODB_URI, {
          authMechanismProperties: {
            ALLOWED_HOSTS: []
          }
        });
        collection = client.db('test').collection('test');
      });
      // Create a client with a url of the form mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:azure,TOKEN_AUDIENCE:<foo>,
      //   and an ALLOWED_HOSTS that is an empty list.
      // Assert that a find operation succeeds.
      // Close the client.
      it('successfully authenticates', async function () {
        const result = await collection.findOne();
        expect(result).to.be.null;
      });
    });

    describe('3.3 Main Cache Not Used', function () {
      beforeEach(function () {
        callbackCache?.clear();
        client = this.configuration.newClient(process.env.MONGODB_URI);
        collection = client.db('test').collection('test');
      });
      // Clear the main OIDC cache.
      // Create a client with a url of the form mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:azure,TOKEN_AUDIENCE:<foo>.
      // Assert that a find operation succeeds.
      // Close the client.
      // Assert that the main OIDC cache is empty.
      it('does not use the main callback cache', async function () {
        const result = await collection.findOne();
        expect(result).to.be.null;
        expect(callbackCache.entries).to.be.empty;
      });
    });

    describe('3.4 Azure Cache is Used', function () {
      beforeEach(function () {
        callbackCache?.clear();
        azureCache?.clear();
        client = this.configuration.newClient(process.env.MONGODB_URI);
        collection = client.db('test').collection('test');
      });
      // Clear the Azure OIDC cache.
      // Create a client with a url of the form mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:azure,TOKEN_AUDIENCE:<foo>.
      // Assert that a find operation succeeds.
      // Close the client.
      // Assert that the Azure OIDC cache has one entry.
      it('uses the Azure OIDC cache', async function () {
        const result = await collection.findOne();
        expect(result).to.be.null;
        expect(callbackCache.entries).to.be.empty;
        expect(azureCache.entries.size).to.equal(1);
      });
    });

    describe('3.5 Reauthentication Succeeds', function () {
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
      // Removes the fail point.
      const removeFailPoint = async () => {
        return await client.db().admin().command({
          configureFailPoint: 'failCommand',
          mode: 'off'
        });
      };

      beforeEach(async function () {
        azureCache?.clear();
        client = this.configuration.newClient(process.env.MONGODB_URI, { monitorCommands: true });
        await client.db('test').collection('test').findOne();
        addListeners();
        await setupFailPoint();
      });

      afterEach(async function () {
        await removeFailPoint();
      });
      // Clear the Azure OIDC cache.
      // Create a client with an event listener. The following assumes that the driver does not emit saslStart or saslContinue events. If the driver does emit those events, ignore/filter them for the purposes of this test.
      // Perform a find operation that succeeds.
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
      //Note
      //
      //the driver MUST either use a unique appName or explicitly remove the failCommand after the test to prevent leakage.
      //
      //Perform another find operation that succeeds.
      //Assert that the ordering of list started events is [find], , find. Note that if the listener stat could not be cleared then there will and be extra find command.
      //Assert that the list of command succeeded events is [find].
      //Assert that a find operation failed once during the command execution.
      //Close the client.
      it('successfully reauthenticates', async function () {
        await client.db('test').collection('test').findOne();
        expect(commandStartedEvents.map(event => event.commandName)).to.deep.equal([
          'find',
          'find'
        ]);
        expect(commandSucceededEvents.map(event => event.commandName)).to.deep.equal(['find']);
        expect(commandFailedEvents.map(event => event.commandName)).to.deep.equal(['find']);
      });
    });
  });
});
