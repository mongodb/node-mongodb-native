import { expect } from 'chai';

import { Db, type DbOptions } from '../../src/db';
import { MongoClient } from '../../src/mongo_client';
import { ReadPreference } from '../../src/read_preference';

describe('class Db', function () {
  describe('secondaryOk', function () {
    const client = new MongoClient('mongodb://localhost:27017');
    const secondary_ok = 'secondaryOk';

    it('should be false when readPreference is Primary', function () {
      const options: DbOptions = { readPreference: ReadPreference.PRIMARY };
      const mydb = new Db(client, 'mydb', options);

      expect(mydb).property(secondary_ok).to.be.false;
    });

    it('should be true when readPreference is Primary Preferred', function () {
      const options: DbOptions = { readPreference: ReadPreference.PRIMARY_PREFERRED };
      const mydb = new Db(client, 'mydb', options);

      expect(mydb).property(secondary_ok).to.be.true;
    });

    it('should be true when readPreference is Secondary', function () {
      const options: DbOptions = { readPreference: ReadPreference.SECONDARY };
      const mydb = new Db(client, 'mydb', options);

      expect(mydb).property(secondary_ok).to.be.true;
    });

    it('should be true when readPreference is Secondary Preferred', function () {
      const options: DbOptions = { readPreference: ReadPreference.SECONDARY_PREFERRED };
      const mydb = new Db(client, 'mydb', options);

      expect(mydb).property(secondary_ok).to.be.true;
    });

    it('should be true when readPreference is Nearest', function () {
      const options: DbOptions = { readPreference: ReadPreference.NEAREST };
      const mydb = new Db(client, 'mydb', options);

      expect(mydb).property(secondary_ok).to.be.true;
    });
  });
});
