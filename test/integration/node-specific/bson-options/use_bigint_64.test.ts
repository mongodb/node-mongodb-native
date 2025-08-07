import { expect } from 'chai';

import {
  BSON,
  type Collection,
  type Db,
  MongoAPIError,
  type MongoClient,
  type WithId
} from '../../../mongodb';

describe('useBigInt64 option', function () {
  let client: MongoClient;
  let db: Db;
  let coll: Collection;

  afterEach(async function () {
    if (client) {
      if (coll) {
        await coll.drop().catch(() => null);
      }

      if (db) {
        await db.dropDatabase().catch(() => null);
      }

      await client.close();
    }
  });

  describe('when not provided to client', function () {
    beforeEach(async function () {
      client = await this.configuration.newClient().connect();
    });

    it('is set to driver default (useBigInt64=false)', async function () {
      expect(client.s.bsonOptions.useBigInt64).to.exist;
      expect(client.s.bsonOptions.useBigInt64).to.be.false;
    });
  });

  describe('when set at client level', function () {
    beforeEach(async function () {
      client = await this.configuration
        .newClient(
          {},
          {
            useBigInt64: true
          }
        )
        .connect();
    });

    it('supercedes driver level', function () {
      expect(client.s.bsonOptions.useBigInt64).to.exist;
      expect(client.s.bsonOptions.useBigInt64).to.be.true;
    });
  });

  describe('when set at DB level', function () {
    beforeEach(async function () {
      client = await this.configuration
        .newClient(
          {},
          {
            useBigInt64: false
          }
        )
        .connect();

      db = client.db(this.configuration.db, { useBigInt64: true });
    });

    it('supercedes client level', async function () {
      expect(db.s.bsonOptions.useBigInt64).to.exist;
      expect(db.s.bsonOptions.useBigInt64).to.be.true;
    });
  });

  describe('when set at collection level', function () {
    beforeEach(async function () {
      client = await this.configuration.newClient().connect();

      db = client.db(this.configuration.db, { useBigInt64: false });
      await db.dropCollection('useBigInt64Test').catch(() => null);
      coll = await db.createCollection('useBigInt64Test', { useBigInt64: true });
    });

    it('supercedes db level', function () {
      expect(coll.s.bsonOptions.useBigInt64).to.exist;
      expect(coll.s.bsonOptions.useBigInt64).to.be.true;
    });
  });

  describe('when set to true at collection level', function () {
    let res: WithId<BSON.Document> | null;

    beforeEach(async function () {
      client = await this.configuration.newClient().connect();
      db = client.db(this.configuration.db);
      await db.dropCollection('useBigInt64Test').catch(() => null);
    });

    it('supercedes collection level when set to false at operation level', async function () {
      coll = await db.createCollection('useBigInt64Test', { useBigInt64: true });
      await coll.insertMany([{ a: 1n }, { a: 2n }, { a: 3n }, { a: 4n }]);
      res = await coll.findOne({}, { useBigInt64: false });

      expect(res).to.exist;
      expect(typeof res?.a).to.equal('number');
    });
  });

  describe('when set to false at collection level', function () {
    let res: WithId<BSON.Document> | null;

    beforeEach(async function () {
      client = await this.configuration.newClient().connect();
      db = client.db(this.configuration.db);
      await db.dropCollection('useBigInt64Test').catch(() => null);
    });

    it('supercedes collection level when set to true at operation level', async function () {
      coll = await db.createCollection('useBigInt64Test', { useBigInt64: false });
      await coll.insertMany([{ a: 1n }, { a: 2n }, { a: 3n }, { a: 4n }]);
      res = await coll.findOne({}, { useBigInt64: true });

      expect(res).to.exist;
      expect(typeof res?.a).to.equal('bigint');
    });
  });

  describe('when set to true', function () {
    let res: WithId<BSON.Document> | null;

    beforeEach(async function () {
      client = await this.configuration.newClient({}, { useBigInt64: true }).connect();

      db = client.db(this.configuration.db);
      await db.dropCollection('useBigInt64Test').catch(() => null);

      coll = await db.createCollection('useBigInt64Test');
      await coll.insertOne({ a: new BSON.Long(1) });

      res = await coll.findOne({ a: 1n });
    });

    it('deserializes Long to bigint', async function () {
      expect(res).to.exist;
      expect(typeof res?.a).to.equal('bigint');
      expect(res?.a).to.equal(1n);
    });
  });

  describe('when useBigInt64=true and promoteLongs=false', function () {
    describe('when set at client level', function () {
      it('throws a MongoAPIError', async function () {
        expect(() => {
          client = this.configuration.newClient(
            {},
            {
              useBigInt64: true,
              promoteLongs: false
            }
          );
        }).to.throw(MongoAPIError, /Must request either bigint or Long for int64 deserialization/);
      });
    });

    describe('when set at DB level', function () {
      beforeEach(async function () {
        client = await this.configuration.newClient().connect();
        db = client.db('bsonOptions', { promoteLongs: false, useBigInt64: true });

        await db.createCollection('foo');
        await db.createCollection('bar');
      });

      afterEach(async function () {
        await db.dropDatabase();
      });

      it('throws a BSONError', async function () {
        const e = await db
          .listCollections()
          .toArray()
          .catch(e => e);
        expect(e).to.be.instanceOf(BSON.BSONError);
      });
    });

    describe('when set at collection level', function () {
      beforeEach(async function () {
        client = await this.configuration.newClient().connect();
        db = client.db('bsonOptions');
      });

      it('throws a BSONError', async function () {
        const collection = db.collection('bsonError', { promoteLongs: false, useBigInt64: true });

        const e = await collection
          .insertOne({ name: 'bailey ' })
          .then(() => null)
          .catch(e => e);
        expect(e).to.be.instanceOf(BSON.BSONError);
      });
    });

    describe('when set at the operation level', function () {
      beforeEach(async function () {
        client = await this.configuration.newClient().connect();

        db = client.db('bsonOptions');
        coll = db.collection('bsonError');
      });

      it('throws a BSONError', async function () {
        const e = await coll
          .insertOne({ a: 10n }, { promoteLongs: false, useBigInt64: true })
          .catch(e => e);

        expect(e).to.be.instanceOf(BSON.BSONError);
      });
    });
  });

  describe('when useBigInt64=true and promoteValues=false', function () {
    describe('when set at client level', function () {
      it('throws a MongoAPIError', async function () {
        expect(() => {
          client = this.configuration.newClient(
            {},
            {
              useBigInt64: true,
              promoteValues: false
            }
          );
        }).to.throw(MongoAPIError, /Must request either bigint or Long for int64 deserialization/);
      });
    });

    describe('when set at DB level', function () {
      beforeEach(async function () {
        client = await this.configuration.newClient().connect();
        db = client.db('bsonOptions', { promoteLongs: false, useBigInt64: true });

        await db.createCollection('foo');
        await db.createCollection('bar');
      });

      afterEach(async function () {
        await db.dropDatabase();
      });

      it('throws a BSONError', async function () {
        const e = await db
          .listCollections()
          .toArray()
          .catch(e => e);
        expect(e).to.be.instanceOf(BSON.BSONError);
      });
    });

    describe('when set at collection level', function () {
      beforeEach(async function () {
        client = await this.configuration.newClient().connect();
        db = client.db('bsonOptions');
      });

      it('throws a BSONError', async function () {
        const collection = db.collection('bsonError', { promoteValues: false, useBigInt64: true });

        const e = await collection
          .insertOne({ name: 'bailey ' })
          .then(() => null)
          .catch(e => e);
        expect(e).to.be.instanceOf(BSON.BSONError);
      });
    });

    describe('when set at the operation level', function () {
      beforeEach(async function () {
        client = await this.configuration.newClient().connect();
        db = client.db('bsonOptions');
        coll = db.collection('bsonError');
      });

      it('throws a BSONError', async function () {
        const e = await coll
          .insertOne({ a: 10n }, { promoteValues: false, useBigInt64: true })
          .catch(e => e);

        expect(e).to.be.instanceOf(BSON.BSONError);
      });
    });
  });
});
