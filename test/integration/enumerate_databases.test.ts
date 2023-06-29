import { expect } from 'chai';

import { type AddUserOptions, type MongoClient, MongoServerError } from '../mongodb';
import { TestBuilder, UnifiedTestSuiteBuilder } from '../tools/utils';

const metadata: MongoDBMetadataUI = {
  requires: {
    mongodb: '>=4.0.6',
    auth: 'enabled',

    // 'TODO: NODE-3891 - fix tests broken when AUTH enabled'
    //   These tests should work on a load balanced topology
    topology: '!load-balanced'
  }
};

describe('listDatabases()', function () {
  describe('authorizedDatabases option', () => {
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

      await adminClient
        .db(mockAuthorizedDb)
        .createCollection(mockAuthorizedCollection)
        .catch(() => null);

      await adminClient.db('admin').addUser(username, password, authorizedUserOptions);

      authorizedClient = this.configuration.newClient({
        auth: { username: username, password: password }
      });
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

  describe('nameOnly option', function () {
    let client: MongoClient;
    const DBS = 10;
    const nameOnlyOptions = [true, false, undefined];

    beforeEach(async function () {
      client = await this.configuration.newClient().connect();
      for (let i = 0; i < DBS; i++) {
        const db = client.db(`testDb_${i}`);
        await db.collection('test').insertOne({ a: 1 });
      }
    });

    afterEach(async function () {
      if (client) {
        for (let i = 0; i < DBS; i++) {
          await client.db(`testDb_${i}`).dropDatabase();
        }

        await client.close();
      }
    });

    for (const nameOnly of nameOnlyOptions) {
      context(`when options.nameOnly is ${nameOnly ?? 'not defined'}`, function () {
        it(`returns ${optionToExpecation(nameOnly)}`, async function () {
          const response = await client.db().admin().listDatabases({ nameOnly });

          expect(response).to.have.property('databases');
          expect(response.databases).to.have.length.gte(DBS);
          switch (nameOnly) {
            case true:
              for (const db of response.databases) {
                expect(db).property('name').to.exist;
                expect(db).to.not.have.property('sizeOnDisk');
                expect(db).to.not.have.property('empty');
              }
              break;
            case false:
            case undefined:
              for (const db of response.databases) {
                expect(db.name).to.exist;
                expect(db).property('sizeOnDisk').to.exist;
                expect(db).property('empty').to.exist;
              }
              break;
          }
        });
      });
    }

    function optionToExpecation(nameOnly?: boolean): string {
      switch (nameOnly) {
        case true:
          return 'list of only database names';
        case false:
        case undefined:
          return 'list of entire listDatabases responses';
      }
    }
  });
  UnifiedTestSuiteBuilder.describe('comment option')
    .createEntities(UnifiedTestSuiteBuilder.defaultEntities)
    .initialData({
      collectionName: 'collection0',
      databaseName: 'database0',
      documents: [{ _id: 1, x: 11 }]
    })
    .test(
      new TestBuilder('listDatabases should not send comment for server versions < 4.4')
        .runOnRequirement({ maxServerVersion: '4.3.99' })
        .operation({
          name: 'listDatabases',
          arguments: {
            filter: {},
            comment: 'string value'
          },
          object: 'client0'
        })
        .expectEvents({
          client: 'client0',
          events: [
            {
              commandStartedEvent: {
                command: {
                  listDatabases: 1,
                  comment: { $$exists: false }
                }
              }
            }
          ]
        })
        .toJSON()
    )
    .test(
      new TestBuilder('listDatabases should send string comment for server versions >= 4.4')
        .runOnRequirement({ minServerVersion: '4.4.0' })
        .operation({
          name: 'listDatabases',
          arguments: {
            filter: {},
            comment: 'string value'
          },
          object: 'client0'
        })
        .expectEvents({
          client: 'client0',
          events: [
            {
              commandStartedEvent: {
                command: {
                  listDatabases: 1,
                  comment: 'string value'
                }
              }
            }
          ]
        })
        .toJSON()
    )
    .test(
      new TestBuilder('listDatabases should send non-string comment for server versions >= 4.4')
        .runOnRequirement({ minServerVersion: '4.4.0' })
        .operation({
          name: 'listDatabases',
          arguments: {
            filter: {},

            comment: {
              key: 'value'
            }
          },
          object: 'client0'
        })
        .expectEvents({
          client: 'client0',
          events: [
            {
              commandStartedEvent: {
                command: {
                  listDatabases: 1,
                  comment: {
                    key: 'value'
                  }
                }
              }
            }
          ]
        })
        .toJSON()
    )
    .run();
});
