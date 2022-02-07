import { expect } from 'chai';

import { AddUserOptions, MongoClient, MongoServerError } from '../../../src';

const metadata: MongoDBMetadataUI = {
  requires: {
    mongodb: '>=4.0.6',
    auth: 'enabled',

    // 'TODO: NODE-3891 - fix tests broken when AUTH enabled'
    //   These tests should work on a load balanced topology
    topology: '!load-balanced'
  }
};

describe('listDatabases() authorizedDatabases flag', function () {
  const username = 'a';
  const password = 'b';
  const mockAuthorizedDb = 'enumerate_databases';
  const mockAuthorizedCollection = 'enumerate_databases_collection';

  let adminClient: MongoClient;
  let authorizedClient: MongoClient;

  const authorizedUserOptions: AddUserOptions = {
    roles: [{ role: 'read', db: mockAuthorizedDb }]
  };

  beforeEach(async function () {
    adminClient = this.configuration.newClient();
    await adminClient.connect();

    await adminClient
      .db(mockAuthorizedDb)
      .createCollection(mockAuthorizedCollection)
      .catch(() => null);

    await adminClient.db('admin').addUser(username, password, authorizedUserOptions);

    authorizedClient = this.configuration.newClient({
      auth: { username: username, password: password }
    });
    await authorizedClient.connect();
  });

  afterEach(async function () {
    await adminClient?.db('admin').removeUser(username);
    await adminClient?.db(mockAuthorizedDb).dropDatabase();
    await adminClient?.close();
    await authorizedClient?.close();
  });

  it(
    'should list all databases when admin client sets authorizedDatabases to true',
    metadata,
    async function () {
      const adminListDbs = await adminClient
        .db()
        .admin()
        .listDatabases({ authorizedDatabases: true });
      const adminDbs = adminListDbs.databases.map(({ name }) => name);

      // no change in the dbs listed since we're using the admin user
      expect(adminDbs).to.have.length.greaterThan(1);
      expect(adminDbs.filter(db => db === mockAuthorizedDb)).to.have.lengthOf(1);
      expect(adminDbs.filter(db => db !== mockAuthorizedDb)).to.have.length.greaterThan(1);
    }
  );

  it(
    'should list all databases when admin client sets authorizedDatabases to false',
    metadata,
    async function () {
      const adminListDbs = await adminClient
        .db()
        .admin()
        .listDatabases({ authorizedDatabases: false });
      const adminDbs = adminListDbs.databases.map(({ name }) => name);

      // no change in the dbs listed since we're using the admin user
      expect(adminDbs).to.have.length.greaterThan(1);
      expect(adminDbs.filter(db => db === mockAuthorizedDb)).to.have.lengthOf(1);
      expect(adminDbs.filter(db => db !== mockAuthorizedDb)).to.have.length.greaterThan(1);
    }
  );

  it(
    'should list authorized databases with authorizedDatabases set to true',
    metadata,
    async function () {
      const adminListDbs = await adminClient.db().admin().listDatabases();
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
    }
  );

  it(
    'should list authorized databases by default with authorizedDatabases unspecified',
    metadata,
    async function () {
      const adminListDbs = await adminClient.db().admin().listDatabases();
      const authorizedListDbs = await authorizedClient.db().admin().listDatabases();
      const adminDbs = adminListDbs.databases;
      const authorizedDbs = authorizedListDbs.databases;

      expect(adminDbs).to.have.length.greaterThan(1);
      expect(authorizedDbs).to.have.lengthOf(1);

      expect(adminDbs.filter(db => db.name === mockAuthorizedDb)).to.have.lengthOf(1);
      expect(adminDbs.filter(db => db.name !== mockAuthorizedDb)).to.have.length.greaterThan(1);
      expect(authorizedDbs.filter(db => db.name === mockAuthorizedDb)).to.have.lengthOf(1);
    }
  );

  it(
    'should not show authorized databases with authorizedDatabases set to false',
    metadata,
    async function () {
      let thrownError;
      try {
        await authorizedClient.db().admin().listDatabases({ authorizedDatabases: false });
      } catch (error) {
        thrownError = error;
      }

      // check correctly produces an 'Insufficient permissions to list all databases' error
      expect(thrownError).to.be.instanceOf(MongoServerError);
      expect(thrownError).to.have.property('message').that.includes('list');
    }
  );
});
