import { expect } from 'chai';

import { Collection, Db, MongoClient } from '../../../mongodb';
import { setupDatabase } from '../../shared.js';

describe('useBigInt64 option', function () {
  let configuration;
  beforeEach(function () {
    configuration = this.configuration;
    return setupDatabase(this.configuration);
  });

  describe('when not provided to client', async function () {
    let client: MongoClient;

    beforeEach(async function () {
      client = await configuration.newClient(configuration.writeConcernMax());
    });

    afterEach(async function () {
      await client.close();
    });

    it('is set to driver default (useBigInt64=false)', async function () {
      expect(client.s.bsonOptions.useBigInt64).to.exist;
      expect(client.s.bsonOptions.useBigInt64).to.be.false;
    });
  });

  describe('when set at client level', function () {
    let client: MongoClient;
    beforeEach(async function () {
      client = configuration.newClient(configuration.writeConcernMax(), { useBigInt64: true });
    });

    afterEach(async function () {
      await client.close();
    });

    it('supercedes driver level', function () {
      expect(client.s.bsonOptions.useBigInt64).to.exist;
      expect(client.s.bsonOptions.useBigInt64).to.be.true;
    });
  });

  describe('when set at DB level', function () {
    let client: MongoClient;
    let db: Db;
    beforeEach(async function () {
      client = configuration.newClient(configuration.writeConcernMax(), {
        useBigInt64: false
      });

      await client.connect();
      db = client.db(configuration.db, { useBigInt64: true });
      await db.dropCollection('useBigInt64Test').catch(() => null);
    });

    afterEach(async function () {
      await client.close();
    });

    it('supercedes client level', async function () {
      expect(db.s.bsonOptions.useBigInt64).to.exist;
      expect(db.s.bsonOptions.useBigInt64).to.be.true;
    });
  });

  describe('when set at collection level', function () {
    let client: MongoClient;
    let db: Db;
    let col: Collection;

    beforeEach(async function () {
      client = configuration.newClient(configuration.writeConcernMax());

      await client.connect();
      db = client.db(configuration.db, { useBigInt64: false });
      await db.dropCollection('useBigInt64Test').catch(() => null);
      col = await db.createCollection('useBigInt64Test', { useBigInt64: true });
    });

    afterEach(async function () {
      await db
        .dropCollection('useBigInt64Test')
        .catch(() => expect.fail('failed to drop collection'));
      await client.close();
    });

    it('supercedes db level', function () {
      expect(col.s.bsonOptions.useBigInt64).to.exist;
      expect(col.s.bsonOptions.useBigInt64).to.be.true;
    });
  });

  describe('when set at operation level', function () {
    let client: MongoClient;
    let db: Db;
    let col: Collection;

    beforeEach(async function () {
      client = configuration.newClient(configuration.writeConcernMax());
      await client.connect();

      db = client.db(configuration.db);
      await db.dropCollection('useBigInt64Test').catch(() => null);

      col = await db.createCollection('useBigInt64Test');
      await col.insertMany([{ a: 1n }, { a: 2n }, { a: 3n }, { a: 4n }]);
    });

    afterEach(async function () {
      await db
        .dropCollection('useBigInt64Test')
        .catch(() => expect.fail('failed to drop collection'));
      await client.close().catch(() => expect.fail('failed to close client'));
    });

    it('find', async function () {
      const res = await col.findOne({ a: 1n }, { useBigInt64: true });
      expect(res).to.exist;
      expect(typeof res?.a).to.equal('bigint');
    });
  });
});
