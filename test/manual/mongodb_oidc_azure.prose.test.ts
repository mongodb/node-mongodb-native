import { expect } from 'chai';

import { Collection, MongoClient } from '../mongodb';

describe('OIDC Auth Spec Prose Tests', function () {
  describe('3. Azure Automatic Auth', function () {
    let client: MongoClient;
    let collection: Collection;

    afterEach(async function () {
      await client?.close();
    });

    describe('3.1 Connect', function () {
      before(function () {
        client = new MongoClient(
          'mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:azure,TOKEN_AUDIENCE:<foo>'
        );
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
      before(function () {
        client = new MongoClient(
          'mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:azure,TOKEN_AUDIENCE:<foo>',
          {
            authMechanismProperties: {
              ALLOWED_HOSTS: []
            }
          }
        );
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
      // Clear the main OIDC cache.
      // Create a client with a url of the form mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:azure,TOKEN_AUDIENCE:<foo>.
      // Assert that a find operation succeeds.
      // Close the client.
      // Assert that the main OIDC cache is empty.
    });

    describe('3.4 Azure Cache is Used', function () {
      // Clear the Azure OIDC cache.
      // Create a client with a url of the form mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:azure,TOKEN_AUDIENCE:<foo>.
      // Assert that a find operation succeeds.
      // Close the client.
      // Assert that the Azure OIDC cache has one entry.
    });

    describe('3.5 Reauthentication Succeeds', function () {
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
    });
  });
});
