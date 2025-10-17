import { expect } from 'chai';

import { Double, Int32, Long } from '../../../../src';
import { assert as test, setupDatabase } from '../../shared';

describe('Promote Values', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('should correctly honor promoteValues when creating an instance using Db', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), {
      maxPoolSize: 1,
      promoteValues: false
    });
    await client.connect();
    const db = client.db(configuration.db);

    await db.collection('shouldCorrectlyHonorPromoteValues').insertOne({
      doc: Long.fromNumber(10),
      int: 10,
      double: 2.2222,
      array: [[Long.fromNumber(10)]]
    });
    const doc = await db.collection('shouldCorrectlyHonorPromoteValues').findOne();
    expect(Long.fromNumber(10)).deep.equals(doc.doc);
    expect(new Int32(10)).deep.equals(doc.int);
    expect(new Double(2.2222)).deep.equals(doc.double);

    await client.close();
  });

  // TODO(NODE-7192): remove as it duplicates "should correctly honor promoteValues when creating an instance using Db"
  // it('should correctly honor promoteValues when creating an instance using MongoClient', {
  //   // Add a tag that our runner can trigger on
  //   // in this case we are setting that node needs to be higher than 0.10.X to run
  //   metadata: {
  //     requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  //   },
  //
  //   test: async function () {
  //     const configuration = this.configuration;
  //     const client = configuration.newClient({}, { promoteValues: false });
  //     await client.connect();
  //     const db = client.db(configuration.db);
  //
  //     await db.collection('shouldCorrectlyHonorPromoteValues').insertOne({
  //       doc: Long.fromNumber(10),
  //       int: 10,
  //       double: 2.2222,
  //       array: [[Long.fromNumber(10)]]
  //     });
  //
  //     const doc = await db.collection('shouldCorrectlyHonorPromoteValues').findOne();
  //     expect(Long.fromNumber(10)).deep.equals(doc.doc);
  //     expect(new Int32(10)).deep.equals(doc.int);
  //     expect(new Double(2.2222)).deep.equals(doc.double);
  //
  //     await client.close();
  //   }
  // });

  // TODO(NODE-7192): remove as it duplicates "should correctly honor promoteValues when creating an instance using Db"
  // it('should correctly honor promoteValues at cursor level', {
  //   // Add a tag that our runner can trigger on
  //   // in this case we are setting that node needs to be higher than 0.10.X to run
  //   metadata: {
  //     requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  //   },
  //
  //   test: async function () {
  //     const configuration = this.configuration;
  //     const client = configuration.newClient({}, { promoteValues: false });
  //     await client.connect();
  //     const db = client.db(configuration.db);
  //     await db.collection('shouldCorrectlyHonorPromoteValues').insertOne({
  //       doc: Long.fromNumber(10),
  //       int: 10,
  //       double: 2.2222,
  //       array: [[Long.fromNumber(10)]]
  //     });
  //
  //     const doc = await db.collection('shouldCorrectlyHonorPromoteValues').find().next();
  //     expect(doc.doc).to.deep.equal(Long.fromNumber(10));
  //     expect(doc.int).to.deep.equal(new Int32(10));
  //     expect(doc.double).to.deep.equal(new Double(2.2222));
  //
  //     await client.close();
  //   }
  // });

  it('should correctly honor promoteValues at cursor find level', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient();
    await client.connect();
    const db = client.db(configuration.db);

    await db.collection('shouldCorrectlyHonorPromoteValues').insertOne({
      doc: Long.fromNumber(10),
      int: 10,
      double: 2.2222,
      array: [[Long.fromNumber(10)]]
    });

    const doc = await db
      .collection('shouldCorrectlyHonorPromoteValues')
      .find({}, { promoteValues: false })
      .next();
    expect(doc.doc).to.deep.equal(Long.fromNumber(10));
    expect(doc.int).to.deep.equal(new Int32(10));
    expect(doc.double).to.deep.equal(new Double(2.2222));

    await client.close();
  });

  it('should correctly honor promoteValues at aggregate level', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient();
    await client.connect();
    const db = client.db(configuration.db);
    await db.collection('shouldCorrectlyHonorPromoteValues2').insertOne({
      doc: Long.fromNumber(10),
      int: 10,
      double: 2.2222,
      array: [[Long.fromNumber(10)]]
    });
    const doc = await db
      .collection('shouldCorrectlyHonorPromoteValues2')
      .aggregate([{ $match: {} }], { promoteValues: false })
      .next();
    expect(doc.doc).to.deep.equal(Long.fromNumber(10));
    expect(doc.int).to.deep.equal(new Int32(10));
    expect(doc.double).to.deep.equal(new Double(2.2222));

    await client.close();
  });

  it('Should correctly promoteValues when calling getMore on queries', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient();
    const docs = new Array(150).fill(0).map(function (_, i) {
      return {
        _id: 'needle_' + i,
        is_even: i % 2,
        long: Long.fromString('1234567890'),
        double: 0.23456,
        int: 1234
      };
    });

    const db = client.db(configuration.db);

    await db.collection<{ _id: string }>('haystack').insertMany(docs);

    const stream = db
      .collection('haystack')
      .find({}, { batchSize: 50, promoteValues: false })
      .stream();

    for await (const doc of stream) {
      test.equal(typeof doc.int, 'object');
      test.equal(doc.int._bsontype, 'Int32');
      test.equal(typeof doc.long, 'object');
      test.equal(doc.long._bsontype, 'Long');
      test.equal(typeof doc.double, 'object');
      test.equal(doc.double._bsontype, 'Double');
    }

    await client.close();
  });
});
