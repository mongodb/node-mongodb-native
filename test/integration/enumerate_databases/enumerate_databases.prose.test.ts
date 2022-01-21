import { expect } from 'chai';

import type { MongoClient } from '../../../src';

const REQUIRED_DBS = ['admin', 'local', 'config'];
const DB_NAME = 'listDatabasesTest';

describe('listDatabases() spec prose', function () {
  /**
   * Execute the method to enumerate full database information (e.g. listDatabases())
   * - Verify that the method returns an Iterable of Document types
   * - Verify that all databases on the server are present in the result set
   * - Verify that the result set does not contain duplicates
   */
  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient();
    await client.connect();

    const dbInfoFromCommand = await client.db('admin').command({ listDatabases: 1 });
    const databasesToDrop = dbInfoFromCommand.databases
      .map(({ name }) => name)
      .filter(name => !REQUIRED_DBS.includes(name));

    for (const dbToDrop of databasesToDrop) {
      await client.db(dbToDrop).dropDatabase();
    }

    await client.db(DB_NAME).createCollection(DB_NAME);
  });

  afterEach(async function () {
    await client.db(DB_NAME).dropDatabase();
    await client?.close();
  });

  it('Verify that the method returns an Iterable of Document types', async () => {
    const dbInfo = await client.db().admin().listDatabases();
    expect(dbInfo).to.have.property('databases');
    expect(dbInfo.databases).to.be.an('array');
    expect(dbInfo.databases).to.have.lengthOf.at.least(1);
    for (const db of dbInfo.databases) {
      expect(db).to.be.a('object');
    }
  });

  it('Verify that all databases on the server are present in the result set', async () => {
    const dbInfoFromCommand = await client.db('admin').command({ listDatabases: 1 });
    const dbInfo = await client.db().admin().listDatabases();

    const namesFromCommand = dbInfoFromCommand.databases.map(({ name }) => name);
    namesFromCommand.sort();
    const namesFromHelper = dbInfo.databases.map(({ name }) => name);
    namesFromHelper.sort();

    expect(namesFromHelper).to.have.lengthOf.at.least(1);
    expect(namesFromHelper).to.deep.equal(namesFromCommand);
    expect(namesFromHelper).to.include(DB_NAME);
  });

  it('Verify that the result set does not contain duplicates', async () => {
    const dbInfo = await client.db().admin().listDatabases();
    const databaseNames = dbInfo.databases.map(({ name }) => name);
    const databaseNamesSet = new Set(databaseNames);
    expect(databaseNames).to.have.lengthOf(databaseNamesSet.size);
  });
});
