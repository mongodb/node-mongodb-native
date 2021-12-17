import { expect } from 'chai';

import { MongoClient } from '../../src';
import { Db, DbOptions } from '../../src/db';
import { ReadPreference } from '../../src/read_preference';

describe('class Db', function () {
  const client = new MongoClient('mongodb://localhost:27017');
  const legacy_secondary_ok = 'slaveOk';

  it.only('secondaryOk should be false when readPreference is Primary', function () {
    const options: DbOptions = { readPreference: ReadPreference.PRIMARY };
    const mydb = new Db(client, 'mydb', options);

    expect(mydb.secondaryOk).to.be.false;
    expect(mydb[legacy_secondary_ok]).to.be.false;
  });

  it.only('secondaryOk should be true when readPreference is Primary Preferred', function () {
    const options: DbOptions = { readPreference: ReadPreference.PRIMARY_PREFERRED };
    const mydb = new Db(client, 'mydb', options);

    expect(mydb.secondaryOk).to.be.true;
    expect(mydb[legacy_secondary_ok]).to.be.true;
  });

  it.only('secondaryOk should be true when readPreference is Secondary', function () {
    const options: DbOptions = { readPreference: ReadPreference.SECONDARY };
    const mydb = new Db(client, 'mydb', options);

    expect(mydb.secondaryOk).to.be.true;
    expect(mydb[legacy_secondary_ok]).to.be.true;
  });

  it.only('secondaryOk should be true when readPreference is Secondary Preferred', function () {
    const options: DbOptions = { readPreference: ReadPreference.SECONDARY_PREFERRED };
    const mydb = new Db(client, 'mydb', options);

    expect(mydb.secondaryOk).to.be.true;
    expect(mydb[legacy_secondary_ok]).to.be.true;
  });

  it.only('secondaryOk should be true when readPreference is Nearest', function () {
    const options: DbOptions = { readPreference: ReadPreference.NEAREST };
    const mydb = new Db(client, 'mydb', options);

    expect(mydb.secondaryOk).to.be.true;
    expect(mydb[legacy_secondary_ok]).to.be.true;
  });
});
