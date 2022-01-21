import { expect } from 'chai';

import type { MongoClient } from '../../../src';

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
  });

  afterEach(async function () {
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
  });

  it('Verify that the result set does not contain duplicates', async () => {
    const dbInfo = await client.db().admin().listDatabases();
    const databaseNames = dbInfo.databases.map(({ name }) => name);
    const databaseNamesSet = new Set(databaseNames);
    expect(databaseNames).to.have.lengthOf(databaseNamesSet.size);
  });
});
