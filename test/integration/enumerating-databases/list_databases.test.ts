import { expect } from 'chai';

import { AddUserOptions, MongoClient, MongoServerError } from '../../../src';

describe('listDatabases', function () {
  beforeEach(function () {
    if (process.env.AUTH !== 'auth') {
      this.skip();
    }
  });

  describe('authorizedDatabases flag', function () {
    const username = 'a';
    const password = 'b';
    const mockAuthorizedDb = 'mockAuthorizedDb';

    let client, authorizedClient: MongoClient;

    const authorizedUserOptions: AddUserOptions = {
      roles: [{ role: 'read', db: mockAuthorizedDb }]
    };

    beforeEach(async function () {
      client = this.configuration.newClient({ auth: { username: 'user', password: 'password' } });
      await client.connect();

      await client
        .db('mockAuthorizedDb')
        .createCollection('a')
        .catch(() => null);

      await client.db('admin').addUser(username, password, authorizedUserOptions);

      authorizedClient = this.configuration.newClient({
        auth: { username: username, password: password }
      });
      await authorizedClient.connect();
    });

    afterEach(async function () {
      await client.db('admin').removeUser(username);
      await client.close();
      await authorizedClient.close();
    });

    it('should list authorized databases for authorizedDatabases set to true', async function () {
      const adminListDbs = await client.db().admin().listDatabases();
      const authorizedListDbs = await authorizedClient
        .db()
        .admin()
        .listDatabases({ authorizedDatabases: true });
      const adminDbs = adminListDbs.databases;
      const authorizedDbs = authorizedListDbs.databases;

      expect(adminDbs).to.have.length.greaterThan(1);
      expect(authorizedDbs).to.have.length(1);

      expect(adminDbs.filter(db => db.name === mockAuthorizedDb).length).equals(1);
      expect(adminDbs.filter(db => db.name !== mockAuthorizedDb).length).greaterThan(0);
      expect(authorizedDbs.filter(db => db.name === mockAuthorizedDb).length).equals(1);
    });

    it('should error for authorizedDatabases set to false', async function () {
      let thrownError;
      try {
        await authorizedClient.db().admin().listDatabases({ authorizedDatabases: false });
      } catch (error) {
        thrownError = error;
      }

      if (thrownError) {
        expect(thrownError).to.be.instanceOf(MongoServerError);
        expect(thrownError).to.have.property('message').that.includes('list');
      }
    });
  });
});
