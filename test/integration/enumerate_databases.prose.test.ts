import { expect } from 'chai';

import type { MongoClient } from '../../src';

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
  let ENTIRE_DB_LIST: string[];

  beforeEach(async function () {
    client = this.configuration.newClient();

    const dbInfoFromCommand = await client.db('admin').command({ listDatabases: 1 });
    const databasesToDrop = dbInfoFromCommand.databases
      .map(({ name }) => name)
      .filter(name => !REQUIRED_DBS.includes(name));

    for (const dbToDrop of databasesToDrop) {
      await client.db(dbToDrop).dropDatabase();
    }

    await client.db(DB_NAME).createCollection(DB_NAME);

    ENTIRE_DB_LIST = (await client.db('admin').command({ listDatabases: 1 })).databases.map(
      ({ name }) => name
    );
    ENTIRE_DB_LIST.sort();
    expect(ENTIRE_DB_LIST).to.have.lengthOf.at.least(1);
  });

  afterEach(async function () {
    await client.db(DB_NAME).dropDatabase();
    await client?.close();
  });

  it('Verify that the method returns an Iterable of Document types', async () => {
    const dbInfo = await client.db().admin().listDatabases();
    expect(dbInfo).to.have.property('databases');
    expect(dbInfo.databases).to.be.an('array');
    expect(dbInfo.databases).to.have.lengthOf(ENTIRE_DB_LIST.length);
    for (const db of dbInfo.databases) {
      expect(db).to.be.a('object');
    }
  });

  it('Verify that all databases on the server are present in the result set', async () => {
    const dbInfo = await client.db().admin().listDatabases();

    const namesFromHelper = dbInfo.databases.map(({ name }) => name);
    namesFromHelper.sort();

    expect(namesFromHelper).to.have.lengthOf(ENTIRE_DB_LIST.length);
    expect(namesFromHelper).to.deep.equal(ENTIRE_DB_LIST);
    expect(namesFromHelper).to.include(DB_NAME);
  });

  it('Verify that the result set does not contain duplicates', async () => {
    const dbInfo = await client.db().admin().listDatabases();
    const databaseNames = dbInfo.databases.map(({ name }) => name);
    const databaseNamesSet = new Set(databaseNames);
    expect(databaseNames).to.have.lengthOf(databaseNamesSet.size);
  });
});
