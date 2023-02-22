import { expect } from 'chai';

import { BSON, Collection, Db, MongoAPIError, MongoClient } from '../../../mongodb';

describe('useBigInt64 option', function() {
  let client: MongoClient;
  let db: Db;
  let coll: Collection;

  afterEach(async function() {
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

  describe('when not provided to client', async function() {
    beforeEach(async function() {
      client = await this.configuration.newClient().connect();
    });

    it('is set to driver default (useBigInt64=false)', async function() {
      expect(client.s.bsonOptions.useBigInt64).to.exist;
      expect(client.s.bsonOptions.useBigInt64).to.be.false;
    });
  });

  describe('when set at client level', function() {
    beforeEach(async function() {
      client = await this.configuration.newClient(
        {},
        {
          useBigInt64: true
        }
      ).connect();
    });

    it('supercedes driver level', function() {
      expect(client.s.bsonOptions.useBigInt64).to.exist;
      expect(client.s.bsonOptions.useBigInt64).to.be.true;
    });
  });

  describe('when set at DB level', function() {
    beforeEach(async function() {
      client = await this.configuration.newClient(
        {},
        {
          useBigInt64: false
        }
      ).connect();

      db = client.db(this.configuration.db, { useBigInt64: true });
    });

    it('supercedes client level', async function() {
      expect(db.s.bsonOptions.useBigInt64).to.exist;
      expect(db.s.bsonOptions.useBigInt64).to.be.true;
    });
  });

  describe('when set at collection level', function() {
    beforeEach(async function() {
      client = await this.configuration.newClient().connect();

      db = client.db(this.configuration.db, { useBigInt64: false });
      await db.dropCollection('useBigInt64Test').catch(() => null);
      coll = await db.createCollection('useBigInt64Test', { useBigInt64: true });
    });

    it('supercedes db level', function() {
      expect(coll.s.bsonOptions.useBigInt64).to.exist;
      expect(coll.s.bsonOptions.useBigInt64).to.be.true;
    });
  });

  describe('when set at operation level', function() {
    let res;

    beforeEach(async function() {
      client = await this.configuration.newClient().connect();

      db = client.db(this.configuration.db);
      await db.dropCollection('useBigInt64Test').catch(() => null);

      coll = await db.createCollection('useBigInt64Test');
      await coll.insertMany([{ a: 1n }, { a: 2n }, { a: 3n }, { a: 4n }]);
      res = await coll.findOne({ a: 1n }, { useBigInt64: true });
    });

    it('deserializes to a bigint', async function() {
      expect(res).to.exist;
      expect(typeof res?.a).to.equal('bigint');
    });
  });

  describe('when useBigInt64=true and promoteLongs=false', function() {
    describe('when set at client level', function() {
      it('throws a MongoAPIError', async function() {
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

    describe('when set at DB level', function() {
      beforeEach(async function() {
        client = await this.configuration.newClient().connect();
        db = client.db('bsonOptions', { promoteLongs: false, useBigInt64: true });
      });

      it('throws a BSONError', async function() {
        const e = await db.createCollection('bsonError').catch(e => e);
        expect(e).to.be.instanceOf(BSON.BSONError);
      });
    });

    describe('when set at collection level', function() {
      beforeEach(async function() {
        client = await this.configuration.newClient().connect();
        db = client.db('bsonOptions');
      });

      it('throws a BSONError', async function() {
        const e = await db
          .createCollection('bsonError', { promoteLongs: false, useBigInt64: true })
          .catch(e => e);
        expect(e).to.be.instanceOf(BSON.BSONError);
      });
    });

    describe('when set at the operation level', function() {
      beforeEach(async function() {
        client = await this.configuration.newClient().connect();

        db = client.db('bsonOptions');
        coll = db.collection('bsonError');
      });

      it('throws a BSONError', async function() {
        const e = await coll
          .insertOne({ a: 10n }, { promoteLongs: false, useBigInt64: true })
          .catch(e => e);

        expect(e).to.be.instanceOf(BSON.BSONError);
      });
    });
  });

  describe('when useBigInt64=true and promoteValues=false', function() {
    describe('when set at client level', function() {
      it('throws a MongoAPIError', async function() {
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

    describe('when set at DB level', function() {
      beforeEach(async function() {
        client = await this.configuration.newClient().connect();
        db = client.db('bsonOptions', { promoteValues: false, useBigInt64: true });
      });

      it('throws a BSONError', async function() {
        const e = await db.createCollection('bsonError').catch(e => e);
        expect(e).to.be.instanceOf(BSON.BSONError);
      });
    });

    describe('when set at collection level', function() {
      beforeEach(async function() {
        client = await this.configuration.newClient().connect();
        db = client.db('bsonOptions');
      });

      it('throws a BSONError', async function() {
        const e = await db
          .createCollection('bsonError', { promoteValues: false, useBigInt64: true })
          .catch(e => e);
        expect(e).to.be.instanceOf(BSON.BSONError);
      });
    });

    describe('when set at the operation level', function() {
      beforeEach(async function() {
        client = await this.configuration.newClient().connect();
        db = client.db('bsonOptions');
        coll = db.collection('bsonError');
      });

      it('throws a BSONError', async function() {
        const e = await coll
          .insertOne({ a: 10n }, { promoteValues: false, useBigInt64: true })
          .catch(e => e);

        expect(e).to.be.instanceOf(BSON.BSONError);
      });
    });
  });
});
