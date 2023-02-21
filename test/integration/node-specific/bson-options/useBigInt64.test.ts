import { expect } from 'chai';

import { BSON, Collection, Db, MongoAPIError, MongoClient } from '../../../mongodb';
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
      client = configuration.newClient(configuration.writeConcernMax());
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
    beforeEach(function () {
      client = configuration.newClient(configuration.writeConcernMax(), {
        useBigInt64: true,
        promoteLongs: true,
        promoteValues: true
      });
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

    it('deserializes to a bigint', async function () {
      const res = await col.findOne({ a: 1n }, { useBigInt64: true });
      expect(res).to.exist;
      expect(typeof res?.a).to.equal('bigint');
    });
  });

  describe('when useBigInt64=true and promoteLongs=false', function () {
    let client: MongoClient;

    afterEach(async function () {
      if (client) {
        await client.close();
      }
    });

    describe('when set at client level', function () {
      it('throws a MongoAPIError', async function () {
        expect(() => {
          client = configuration.newClient(configuration.writeConcernMax(), {
            useBigInt64: true,
            promoteLongs: false
          });
        }).to.throw(MongoAPIError, /Must request either bigint or Long for int64 deserialization/);
      });
    });

    describe('when set at DB level', function () {
      it('throws a BSONError', async function () {
        client = configuration.newClient(configuration.writeConcernMax());
        await client.connect();
        const db = client.db('bsonOptions', { promoteLongs: false, useBigInt64: true });
        const e = await db.createCollection('bsonError').catch(e => e);
        expect(e).to.be.instanceOf(BSON.BSONError);
      });
    });

    describe('when set at collection level', function () {
      it('throws a BSONError', async function () {
        client = configuration.newClient(configuration.writeConcernMax());
        await client.connect();
        const db = client.db('bsonOptions');
        const e = await db
          .createCollection('bsonError', { promoteLongs: false, useBigInt64: true })
          .catch(e => e);
        expect(e).to.be.instanceOf(BSON.BSONError);
      });
    });

    describe('when set at the operation level', function () {
      it('throws a BSONError', async function () {
        client = configuration.newClient(configuration.writeConcernMax());
        await client.connect();

        const db = client.db('bsonOptions');
        const coll = db.collection('bsonError');
        const e = await coll
          .insertOne({ a: 10n }, { promoteLongs: false, useBigInt64: true })
          .catch(e => e);

        expect(e).to.be.instanceOf(BSON.BSONError);
      });
    });
  });

  describe('when useBigInt64=true and promoteValues=false', function () {
    let client: MongoClient;

    afterEach(async function () {
      if (client) {
        await client.close();
      }
    });

    describe('when set at client level', function () {
      it('throws a MongoAPIError', async function () {
        expect(() => {
          client = configuration.newClient(configuration.writeConcernMax(), {
            useBigInt64: true,
            promoteValues: false
          });
        }).to.throw(MongoAPIError, /Must request either bigint or Long for int64 deserialization/);
      });
    });

    describe('when set at DB level', function () {
      it('throws a BSONError', async function () {
        client = configuration.newClient(configuration.writeConcernMax());
        await client.connect();
        const db = client.db('bsonOptions', { promoteValues: false, useBigInt64: true });
        const e = await db.createCollection('bsonError').catch(e => e);
        expect(e).to.be.instanceOf(BSON.BSONError);
      });
    });

    describe('when set at collection level', function () {
      it('throws a BSONError', async function () {
        client = configuration.newClient(configuration.writeConcernMax());
        await client.connect();
        const db = client.db('bsonOptions');
        const e = await db
          .createCollection('bsonError', { promoteValues: false, useBigInt64: true })
          .catch(e => e);
        expect(e).to.be.instanceOf(BSON.BSONError);
      });
    });

    describe('when set at the operation level', function () {
      it('throws a BSONError', async function () {
        client = configuration.newClient(configuration.writeConcernMax());
        await client.connect();

        const db = client.db('bsonOptions');
        const coll = db.collection('bsonError');
        const e = await coll
          .insertOne({ a: 10n }, { promoteValues: false, useBigInt64: true })
          .catch(e => e);

        expect(e).to.be.instanceOf(BSON.BSONError);
      });
    });
  });
});
