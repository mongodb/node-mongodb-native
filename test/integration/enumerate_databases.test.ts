import { expect } from 'chai';

import { AddUserOptions, MongoClient, MongoServerError } from '../../src';

describe('listDatabases', function () {
  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient();
    await client.connect();
  });

  afterEach(async function () {
    await client?.close();
  });

  it('should return an Array', async () => {
    const dbInfo = await client.db().admin().listDatabases();
    expect(Array.isArray(dbInfo.databases)).to.be.true;
  });

  it('should contain no duplicates', async () => {
    const dbInfo = await client.db().admin().listDatabases();
    const databaseNames = dbInfo.databases.map(({ name }) => name);
    const databaseNamesSet = new Set(databaseNames);
    expect(databaseNames).to.have.lengthOf(databaseNamesSet.size);
  });

  // TODO(NODE-3860): Create driver test variants that require AUTH enabled
  describe('authorizedDatabases flag', function () {
    const username = 'a';
    const password = 'b';
    const mockAuthorizedDb = 'enumerate_databases';
    const mockAuthorizedCollection = 'enumerate_databases_collection';

    let client: MongoClient;
    let authorizedClient: MongoClient;

    const authorizedUserOptions: AddUserOptions = {
      roles: [{ role: 'read', db: mockAuthorizedDb }]
    };

    beforeEach(function () {
      if (process.env.AUTH !== 'auth') {
        this.currentTest.skipReason =
          'TODO(NODE-3860): Create driver test variants that require AUTH enabled';
        this.skip();
      }
    });

    beforeEach(async function () {
      // pass credentials from cluster_setup's mlaunch defaults
      // TODO(NODE-3860): pass credentials instead based on environment variable
      client = this.configuration.newClient({ auth: { username: 'user', password: 'password' } });
      await client.connect();

      await client
        .db(mockAuthorizedDb)
        .createCollection(mockAuthorizedCollection)
        .catch(() => null);

      await client.db('admin').addUser(username, password, authorizedUserOptions);

      authorizedClient = this.configuration.newClient({
        auth: { username: username, password: password }
      });
      await authorizedClient.connect();
    });

    afterEach(async function () {
      await client?.db('admin').removeUser(username);
      await client?.db(mockAuthorizedDb).dropDatabase();
      await client?.close();
      await authorizedClient?.close();
    });

    it('should list authorized databases with authorizedDatabases set to true', async function () {
      const adminListDbs = await client.db().admin().listDatabases();
      const authorizedListDbs = await authorizedClient
        .db()
        .admin()
        .listDatabases({ authorizedDatabases: true });
      const adminDbs = adminListDbs.databases;
      const authorizedDbs = authorizedListDbs.databases;

      expect(adminDbs).to.have.length.greaterThan(1);
      expect(authorizedDbs).to.have.lengthOf(1);

      expect(adminDbs.filter(db => db.name === mockAuthorizedDb)).to.have.lengthOf(1);
      expect(adminDbs.filter(db => db.name !== mockAuthorizedDb)).to.have.length.greaterThan(1);
      expect(authorizedDbs.filter(db => db.name === mockAuthorizedDb)).to.have.lengthOf(1);
    });

    it('should list authorized databases by default with authorizedDatabases unspecified', async function () {
      const adminListDbs = await client.db().admin().listDatabases();
      const authorizedListDbs = await authorizedClient.db().admin().listDatabases();
      const adminDbs = adminListDbs.databases;
      const authorizedDbs = authorizedListDbs.databases;

      expect(adminDbs).to.have.length.greaterThan(1);
      expect(authorizedDbs).to.have.lengthOf(1);

      expect(adminDbs.filter(db => db.name === mockAuthorizedDb)).to.have.lengthOf(1);
      expect(adminDbs.filter(db => db.name !== mockAuthorizedDb)).to.have.length.greaterThan(1);
      expect(authorizedDbs.filter(db => db.name === mockAuthorizedDb)).to.have.lengthOf(1);
    });

    it('should not show authorized databases with authorizedDatabases set to false', async function () {
      let thrownError;
      try {
        await authorizedClient.db().admin().listDatabases({ authorizedDatabases: false });
      } catch (error) {
        thrownError = error;
      }

      // check correctly produces an 'Insufficient permissions to list all databases' error
      expect(thrownError).to.be.instanceOf(MongoServerError);
      expect(thrownError).to.have.property('message').that.includes('list');
    });
  });
});
