import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  Code,
  Long,
  type MongoClient,
  MongoServerError,
  ObjectId,
  ReturnDocument
} from '../../../src';
import { CursorResponse } from '../../../src/cmap/wire_protocol/responses';
import { assert as test, filterForCommands } from '../shared';

describe('Find', function () {
  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient();

    const utilClient = this.configuration.newClient();
    await utilClient
      .db(this.configuration.db)
      .dropDatabase()
      .catch(() => null);
    await utilClient
      .db(this.configuration.db)
      .createCollection('test')
      .catch(() => null);
    await utilClient.close();
  });

  afterEach(async function () {
    await client?.close();
  });

  it('should correctly perform simple find', async function () {
    const configuration = this.configuration;

    const db = client.db(configuration.db);
    await db.dropCollection('test_find_simple');
    const collection = db.collection('test_find_simple');
    const docs = [{ a: 2 }, { b: 3 }];

    await collection.insertMany(docs, configuration.writeConcernMax());

    const insertedDocs = await collection.find().toArray();
    expect(insertedDocs).to.have.length(2);

    const docCount = await collection.countDocuments();
    expect(docCount).to.equal(2);

    const valuesBySelection = await collection.find({ a: docs[0].a }).toArray();
    expect(valuesBySelection).to.have.length(1);
    expect(valuesBySelection[0].a).to.deep.equal(docs[0].a);
  });

  // TODO(NODE-7219): Remove test as it duplicates "should correctly perform simple find"
  // it('shouldCorrectlyPerformSimpleChainedFind', {
  //   metadata: {
  //     requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  //   },
  //
  //   test: function (done) {
  //     var configuration = this.configuration;
  //     var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
  //     client.connect(function (err, client) {
  //       var db = client.db(configuration.db);
  //       db.createCollection('test_find_simple_chained', function (err) {
  //         expect(err).to.not.exist;
  //         const collection = db.collection('test_find_simple_chained');
  //         const docs = [{ a: 2 }, { b: 3 }];
  //
  //         // Insert some test documents
  //         collection.insert(docs, configuration.writeConcernMax(), err => {
  //           expect(err).to.not.exist;
  //
  //           // Ensure correct insertion testing via the cursor and the count function
  //           collection.find().toArray(function (err, documents) {
  //             test.equal(2, documents.length);
  //
  //             collection.count(function (err, count) {
  //               test.equal(2, count);
  //
  //               // Fetch values by selection
  //               collection.find({ a: docs[0].a }).toArray(function (err, documents) {
  //                 test.equal(1, documents.length);
  //                 test.equal(docs[0].a, documents[0].a);
  //                 // Let's close the db
  //                 client.close(done);
  //               });
  //             });
  //           });
  //         });
  //       });
  //     });
  //   }
  // });

  it('should correctly perform advanced finds', async function () {
    const configuration = this.configuration;

    const db = client.db(configuration.db);
    await db.dropCollection('test_find_advanced');
    const collection = db.collection('test_find_advanced');
    const docs = [{ a: 1 }, { a: 2 }, { b: 3 }];

    await collection.insertMany(docs, configuration.writeConcernMax());

    const aLT10Docs = await collection.find({ a: { $lt: 10 } }).toArray();
    expect(aLT10Docs).to.have.length(2);
    expect(aLT10Docs.filter(doc => doc.a === 1 || doc.a === 2)).to.have.length(2);

    const aGT1 = await collection.find({ a: { $gt: 1 } }).toArray();
    expect(aGT1).to.have.length(1);
    expect(aGT1[0].a).to.equal(2);

    const aLTE1 = await collection.find({ a: { $lte: 1 } }).toArray();
    expect(aLTE1).to.have.length(1);
    expect(aLTE1[0].a).to.equal(1);

    const aGTE1 = await collection.find({ a: { $gte: 1 } }).toArray();
    expect(aGTE1).to.have.length(2);

    expect(aGTE1.filter(doc => doc.a === 1 || doc.a === 2)).to.have.length(2);

    const aGT1LT3 = await collection.find({ a: { $gt: 1, $lt: 3 } }).toArray();
    expect(aGT1LT3).to.have.length(1);
    expect(aGT1LT3[0].a).to.equal(2);

    const aIN = await collection.find({ a: { $in: [1, 2] } }).toArray();
    expect(aIN).to.have.length(2);

    expect(aIN.filter(doc => doc.a === 1 || doc.a === 2)).to.have.length(2);

    const byID = await collection
      .find({ _id: { $in: [docs[0]['_id'], docs[1]['_id']] } })
      .toArray();
    expect(byID).to.have.length(2);
    expect(byID.filter(doc => doc.a === 1 || doc.a === 2)).to.have.length(2);
  });

  it('should correctly perform find with sort', async function () {
    const db = client.db(this.configuration.db);
    await db.createCollection('test_find_sorting');

    const collection = db.collection('test_find_sorting');
    // Insert some test documents
    await collection.insertMany(
      [
        { a: 1, b: 2 },
        { a: 2, b: 1 },
        { a: 3, b: 2 },
        { a: 4, b: 1 }
      ],
      this.configuration.writeConcernMax()
    );

    // Test sorting (ascending)
    const ascDocuments = await collection.find({ a: { $lt: 10 } }, { sort: [['a', 1]] }).toArray();
    test.equal(4, ascDocuments.length);
    test.equal(1, ascDocuments[0].a);
    test.equal(2, ascDocuments[1].a);
    test.equal(3, ascDocuments[2].a);
    test.equal(4, ascDocuments[3].a);

    // Test sorting (descending)
    const descDocuments = await collection
      .find({ a: { $lt: 10 } }, { sort: [['a', -1]] })
      .toArray();
    test.equal(4, descDocuments.length);
    test.equal(4, descDocuments[0].a);
    test.equal(3, descDocuments[1].a);
    test.equal(2, descDocuments[2].a);
    test.equal(1, descDocuments[3].a);

    // Test sorting (descending), sort is hash
    const descDocumentsHash = await collection
      .find({ a: { $lt: 10 } }, { sort: { a: -1 } })
      .toArray();
    test.equal(4, descDocumentsHash.length);
    test.equal(4, descDocumentsHash[0].a);
    test.equal(3, descDocumentsHash[1].a);
    test.equal(2, descDocumentsHash[2].a);
    test.equal(1, descDocumentsHash[3].a);

    // Sorting using array of names, assumes ascending order
    const ascDocumentsArray = await collection.find({ a: { $lt: 10 } }, { sort: ['a'] }).toArray();
    test.equal(4, ascDocumentsArray.length);
    test.equal(1, ascDocumentsArray[0].a);
    test.equal(2, ascDocumentsArray[1].a);
    test.equal(3, ascDocumentsArray[2].a);
    test.equal(4, ascDocumentsArray[3].a);

    // Sorting using single name, assumes ascending order
    const ascDocumentsSingle = await collection.find({ a: { $lt: 10 } }, { sort: 'a' }).toArray();
    test.equal(4, ascDocumentsSingle.length);
    test.equal(1, ascDocumentsSingle[0].a);
    test.equal(2, ascDocumentsSingle[1].a);
    test.equal(3, ascDocumentsSingle[2].a);
    test.equal(4, ascDocumentsSingle[3].a);

    // Sorting using single name, assumes ascending order, sort is hash
    const ascDocumentsSingleHash = await collection
      .find({ a: { $lt: 10 } }, { sort: { a: 1 } })
      .toArray();
    test.equal(4, ascDocumentsSingleHash.length);
    test.equal(1, ascDocumentsSingleHash[0].a);
    test.equal(2, ascDocumentsSingleHash[1].a);
    test.equal(3, ascDocumentsSingleHash[2].a);
    test.equal(4, ascDocumentsSingleHash[3].a);

    // Sorting using array of names
    const documentsArrayOfName = await collection
      .find({ a: { $lt: 10 } }, { sort: ['b', 'a'] })
      .toArray();
    test.equal(4, documentsArrayOfName.length);
    test.equal(2, documentsArrayOfName[0].a);
    test.equal(4, documentsArrayOfName[1].a);
    test.equal(1, documentsArrayOfName[2].a);
    test.equal(3, documentsArrayOfName[3].a);

    // Sorting using empty array, no order guarantee should not blow up
    const documentsEmptyArray = await collection.find({ a: { $lt: 10 } }, { sort: [] }).toArray();
    test.equal(4, documentsEmptyArray.length);
  });

  it('should correctly perform find with limit', async function () {
    const db = client.db(this.configuration.db);
    await db.createCollection('test_find_limits');

    const collection = db.collection('test_find_limits');
    // Insert some test documents
    await collection.insertMany(
      [{ a: 1 }, { b: 2 }, { c: 3 }, { d: 4 }],
      this.configuration.writeConcernMax()
    );

    // Test limits
    const limit1 = await collection.find({}, { limit: 1 }).toArray();
    test.equal(1, limit1.length);

    const limit2 = await collection.find({}, { limit: 2 }).toArray();
    test.equal(2, limit2.length);

    const limit3 = await collection.find({}, { limit: 3 }).toArray();
    test.equal(3, limit3.length);

    const limit4 = await collection.find({}, { limit: 4 }).toArray();
    test.equal(4, limit4.length);

    const noLimits = await collection.find({}, {}).toArray();
    test.equal(4, noLimits.length);

    const limit99 = await collection.find({}, { limit: 99 }).toArray();
    test.equal(4, limit99.length);
  });

  it('should correctly find with non quoted values', async function () {
    const db = client.db(this.configuration.db);
    await db.createCollection('test_find_non_quoted_values');

    const collection = db.collection('test_find_non_quoted_values');
    // insert test document
    await collection.insertMany(
      [
        { a: 19, b: 'teststring', c: 59920303 },
        { a: '19', b: 'teststring', c: 3984929 }
      ],
      this.configuration.writeConcernMax()
    );
    const documents = await collection.find({ a: 19 }).toArray();
    test.equal(1, documents.length);
    test.equal(59920303, documents[0].c);
  });

  it('should correctly find embedded document', async function () {
    const db = client.db(this.configuration.db);
    await db.createCollection('test_find_embedded_document');

    const collection = db.collection('test_find_embedded_document');
    // insert test document
    await collection.insertMany(
      [
        { a: { id: 10, value: 'foo' }, b: 'bar', c: { id: 20, value: 'foobar' } },
        { a: { id: 11, value: 'foo' }, b: 'bar2', c: { id: 20, value: 'foobar' } }
      ],
      this.configuration.writeConcernMax()
    );

    // test using integer value
    const intDocuments = await collection.find({ 'a.id': 10 }).toArray();
    test.equal(1, intDocuments.length);
    test.equal('bar', intDocuments[0].b);

    // test using string value
    const strDocuments = await collection.find({ 'a.value': 'foo' }).toArray();
    // should yield 2 documents
    test.equal(2, strDocuments.length);
    test.equal('bar', strDocuments[0].b);
    test.equal('bar2', strDocuments[1].b);
  });

  it('should correctly find no records', async function () {
    const db = client.db(this.configuration.db);
    await db.createCollection('test_find_one_no_records');
    const collection = db.collection('test_find_one_no_records');
    const documents = await collection.find({ a: 1 }, {}).toArray();
    test.equal(0, documents.length);
  });

  it('should correctly perform find by $where', {
    metadata: { requires: { mongodb: '4.2.x' } },
    test: async function () {
      const db = client.db(this.configuration.db);
      const collection = await db.createCollection('test_where');
      await collection.insertMany(
        [{ a: 1 }, { a: 2 }, { a: 3 }],
        this.configuration.writeConcernMax()
      );

      const count = await collection.countDocuments();
      test.equal(3, count);

      // @ts-expect-error: $where no longer supports Code
      const documentsGT2 = await collection.find({ $where: new Code('this.a > 2') }).toArray();
      test.equal(1, documentsGT2.length);

      const documentsGT1 = await collection
        // @ts-expect-error: $where no longer supports Code
        .find({ $where: new Code('this.a > i', { i: 1 }) })
        .toArray();
      test.equal(2, documentsGT1.length);
    }
  });

  it('should correctly perform finds with hint turned on', async function () {
    const configuration = this.configuration;
    const p_client = configuration.newClient(configuration.writeConcernMax(), {
      monitorCommands: true
    });

    const finds = [];
    p_client.on('commandStarted', filterForCommands('find', finds));

    await p_client.connect();

    const db = p_client.db(configuration.db);
    const collection = await db.createCollection('test_hint');

    await collection.deleteMany({});
    await collection.insertOne({ a: 1 }, configuration.writeConcernMax());

    await db.createIndex(collection.collectionName, 'a');

    expect(
      await collection
        .find({ a: 1 }, { hint: 'a' })
        .toArray()
        .catch(e => e)
    ).to.be.instanceOf(MongoServerError);
    expect(finds[0].command.hint).to.equal('a');

    // Test with hint as array
    expect(await collection.find({ a: 1 }, { hint: ['a'] }).toArray()).to.have.lengthOf(1);
    expect(finds[1].command.hint).to.deep.equal({ a: 1 });

    // Test with hint as object
    expect(await collection.find({ a: 1 }, { hint: { a: 1 } }).toArray()).to.have.lengthOf(1);
    expect(finds[2].command.hint).to.deep.equal({ a: 1 });

    await p_client.close();
  });

  it('should correctly perform find by ObjectId', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const collection = await db.createCollection('test_find_by_oid');
    const r = await collection.insertOne({ hello: 'mike' }, configuration.writeConcernMax());
    expect(r).property('insertedId').to.exist;

    const doc = await collection.findOne({ _id: r.insertedId });
    test.equal('mike', doc.hello);

    const id = doc._id.toString();
    const mike = await collection.findOne({ _id: new ObjectId(id) });
    test.equal('mike', mike.hello);
  });

  // TODO(NODE-7219): Remove test as it duplicates other tests that testing nested documents
  // it('shouldCorrectlyReturnDocumentWithOriginalStructure', {
  //   metadata: {
  //     requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  //   },
  //
  //   test: function (done) {
  //     var configuration = this.configuration;
  //     var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
  //     client.connect(function (err, client) {
  //       var db = client.db(configuration.db);
  //       db.createCollection('test_find_by_oid_with_subdocs', function (err, collection) {
  //         var c1 = { _id: new ObjectId(), comments: [], title: 'number 1' };
  //         var c2 = { _id: new ObjectId(), comments: [], title: 'number 2' };
  //         var doc = {
  //           numbers: [],
  //           owners: [],
  //           comments: [c1, c2],
  //           _id: new ObjectId()
  //         };
  //
  //         collection.insert(doc, configuration.writeConcernMax(), function (err) {
  //           expect(err).to.not.exist;
  //           collection.findOne(
  //             { _id: doc._id },
  //             { writeConcern: { w: 1 }, projection: undefined },
  //             function (err, doc) {
  //               expect(err).to.not.exist;
  //               test.equal(2, doc.comments.length);
  //               test.equal('number 1', doc.comments[0].title);
  //               test.equal('number 2', doc.comments[1].title);
  //
  //               client.close(done);
  //             }
  //           );
  //         });
  //       });
  //     });
  //   }
  // });

  // TODO(NODE-7219): Remove test as it duplicates simple find
  // it('shouldCorrectlyRetrieveSingleRecord', {
  //   metadata: {
  //     requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  //   },
  //
  //   test: function (done) {
  //     var configuration = this.configuration;
  //     var p_client = configuration.newClient(configuration.writeConcernMax(), {
  //       maxPoolSize: 1
  //     });
  //
  //     p_client.connect(function (err, client) {
  //       var db = client.db(configuration.db);
  //
  //       db.createCollection(
  //         'test_should_correctly_retrieve_one_record',
  //         function (err, collection) {
  //           collection.insert({ a: 0 }, configuration.writeConcernMax(), function (err) {
  //             expect(err).to.not.exist;
  //             const usercollection = db.collection('test_should_correctly_retrieve_one_record');
  //             usercollection.findOne({ a: 0 }, function (err) {
  //               expect(err).to.not.exist;
  //               p_client.close(done);
  //             });
  //           });
  //         }
  //       );
  //     });
  //   }
  // });

  // TODO(NODE-7219): Remove test as it tests `createFromHexString` method of BSON
  // it('shouldCorrectlyHandleError', {
  //   metadata: {
  //     requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  //   },
  //
  //   test: function (done) {
  //     var configuration = this.configuration;
  //     var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
  //     client.connect(function (err, client) {
  //       var db = client.db(configuration.db);
  //       db.createCollection('test_find_one_error_handling', function (err, collection) {
  //         // Try to fetch an object using a totally invalid and wrong hex string... what we're interested in here
  //         // is the error handling of the findOne Method
  //         try {
  //           collection.findOne(
  //             { _id: ObjectId.createFromHexString('5e9bd59248305adf18ebc15703a1') },
  //             function () {}
  //           );
  //         } catch {
  //           client.close(done);
  //         }
  //       });
  //     });
  //   }
  // });

  it('should correctly perform find with options', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    await db.createCollection('test_field_select_with_options');
    const collection = db.collection('test_field_select_with_options');
    let docCount = 25;
    const docs = [];

    // Insert some test documents
    while (docCount--) docs.push({ a: docCount, b: docCount });
    await collection.insertMany(docs, configuration.writeConcernMax());

    const documents = await collection
      .find({}, { limit: 3, sort: [['a', -1]], projection: { a: 1 } })
      .toArray();
    test.equal(3, documents.length);

    documents.forEach(function (doc, idx) {
      expect(doc.b).to.not.exist; // making sure field select works
      test.equal(24 - idx, doc.a); // checking limit sort object with field select
    });
  });

  it('returns selected fields only for findOneAndUpdate', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const coll = db.collection('test_find_and_modify_a_document_2');
    await coll.insertOne({ a: 1, b: 2 }, configuration.writeConcernMax());

    const updatedDoc = await coll.findOneAndUpdate(
      { a: 1 },
      { $set: { b: 3 } },
      { returnDocument: ReturnDocument.AFTER, projection: { a: 1 } }
    );

    expect(Object.keys(updatedDoc).length).to.equal(2);
    expect(updatedDoc.a).to.equal(1);
  });

  it('should retrieve a document by a value updated with $inc', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const collection = await db.createCollection('shouldCorrectlyExecuteFindOneWithAnInSearchTag');
    // Test return new document on change
    const i = await collection.insertOne(
      {
        title: 'Tobi',
        author: 'Brian',
        newTitle: 'Woot',
        meta: { visitors: 0 }
      },
      configuration.writeConcernMax()
    );
    // Fetch the id
    const id = i.insertedId;

    const u = await collection.updateOne(
      { _id: id },
      { $inc: { 'meta.visitors': 1 } },
      configuration.writeConcernMax()
    );
    expect(u).property('matchedCount').to.equal(1);

    const item = await collection.findOne({ 'meta.visitors': 1 });
    expect(item._id).to.deep.equal(id);
  });

  it('should correctly return null when attempting to modify a non-existing document', async function () {
    const configuration = this.configuration;

    const db = client.db(configuration.db);
    const coll = db.collection('AttemptTofindOneAndUpdateNonExistingDocument');

    const updatedDoc = await coll.findOneAndUpdate(
      { name: 'test1' },
      { $set: { name: 'test2' } },
      {}
    );

    expect(updatedDoc).to.be.null;
  });

  it('should correctly handle chained skip and limit on find with toArray', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const collection = await db.createCollection('skipAndLimitOnFindWithToArray');
    await collection.insertMany([{ a: 1 }, { b: 2 }, { c: 3 }], configuration.writeConcernMax());
    const items = await collection.find().skip(1).limit(-1).toArray();
    test.equal(1, items.length);
    test.equal(2, items[0].b);
  });

  it('should correctly handle chained skip and negative limit on find with toArray', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const collection = await db.createCollection('skipAndNegativeLimitOnFindWithToArray');
    await collection.insertMany(
      [{ a: 1 }, { b: 2 }, { c: 3 }, { d: 4 }, { e: 5 }],
      configuration.writeConcernMax()
    );
    const items = await collection.find().skip(1).limit(-3).toArray();
    test.equal(3, items.length);
    test.equal(2, items[0].b);
    test.equal(3, items[1].c);
    test.equal(4, items[2].d);
  });

  it('should support a timeout option for find operations', async function () {
    const client = this.configuration.newClient({ monitorCommands: true });
    const events = [];
    client.on('commandStarted', event => {
      if (event.commandName === 'find') {
        events.push(event);
      }
    });
    const db = client.db(this.configuration.db);
    const collection = await db.createCollection('cursor_timeout_false_0');
    await collection.find({}, { timeout: false }).toArray();
    expect(events[0]).nested.property('command.noCursorTimeout').to.equal(true);
    await client.close();
  });

  it('should correctly findOneAndUpdate document with DB strict', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);

    const collection = await db.createCollection(
      'shouldCorrectlyfindOneAndUpdateDocumentWithDBStrict'
    );
    // Test return old document on change
    await collection.insertOne({ a: 2, b: 2 }, configuration.writeConcernMax());

    // Let's modify the document in place
    const result = await collection.findOneAndUpdate(
      { a: 2 },
      { $set: { b: 3 } },
      { returnDocument: ReturnDocument.AFTER, includeResultMetadata: true }
    );
    expect(result.value.a).to.equal(2);
    expect(result.value.b).to.equal(3);
  });

  it('should correctly findOneAndUpdate document that fails in first step', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const collection = await db.createCollection(
      'shouldCorrectlyfindOneAndUpdateDocumentThatFailsInFirstStep'
    );
    // Set up an index to force duplicate index erro
    await collection.createIndex([['failIndex', 1]], { unique: true });

    // Setup a new document
    await collection.insertOne({ a: 2, b: 2, failIndex: 2 }, configuration.writeConcernMax());

    // Let's attempt to upsert with a duplicate key error
    const err = await collection
      .findOneAndUpdate(
        { c: 2 },
        { $set: { a: 10, b: 10, failIndex: 2 } },
        { writeConcern: { w: 1 }, upsert: true }
      )
      .catch(e => e);
    expect(err)
      .property('errmsg')
      .to.match(/duplicate key/);
  });

  it('should correctly return new modified document', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const col = await db.collection('Should_correctly_return_new_modified_document');

    const id = new ObjectId();
    const doc = { _id: id, a: 1, b: 1, c: { a: 1, b: 1 } };

    await col.insertOne(doc, configuration.writeConcernMax());

    const item = await col.findOneAndUpdate(
      { _id: id },
      { $set: { 'c.c': 100 } },
      { returnDocument: ReturnDocument.AFTER }
    );

    expect(item._id.toString()).to.equal(doc._id.toString());
    expect(item.a).to.equal(doc.a);
    expect(item.b).to.equal(doc.b);
    expect(item.c.a).to.equal(doc.c.a);
    expect(item.c.b).to.equal(doc.c.b);
    expect(item.c.c).to.equal(100);
  });

  it('should correctly execute findOneAndUpdate', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const collection = await db.createCollection('execute_find_and_modify');
    const self = { _id: new ObjectId() };
    const _uuid = 'sddffdss';

    await collection.findOneAndUpdate(
      { _id: self._id, 'plays.uuid': _uuid },
      { $set: { 'plays.$.active': true } },
      {
        returnDocument: ReturnDocument.AFTER,
        projection: { plays: 0, results: 0 }
      }
    );
  });

  it('should correctly return record with 64-bit id', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const collection = await db.createCollection('should_correctly_return_record_with_64bit_id');
    const _lowerId = new ObjectId();
    const _higherId = new ObjectId();
    const lowerId = Long.fromString('133118461172916224', 10);
    const higherId = Long.fromString('133118461172916225', 10);

    const lowerDoc = { _id: _lowerId, id: lowerId };
    const higherDoc = { _id: _higherId, id: higherId };

    await collection.insertMany([lowerDoc, higherDoc], configuration.writeConcernMax());

    // Select record with id of 133118461172916225 using $gt directive
    const arr = await collection.find({ id: { $gt: lowerId } }, {}).toArray();
    test.equal(arr.length, 1);
    test.equal(arr[0].id.toString(), '133118461172916225');
  });

  it('should correctly find a document using findOne excluding _id field', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);

    const collection = await db.createCollection(
      'Should_Correctly_find_a_Document_using_findOne_excluding__id_field'
    );
    const doc = { _id: new ObjectId(), a: 1, c: 2 };
    // insert doc
    await collection.insertOne(doc, configuration.writeConcernMax());

    // Get one document, excluding the _id field
    const item = await collection.findOne({ a: 1 }, { projection: { _id: 0 } });
    expect(item._id).to.not.exist;
    test.equal(1, item.a);
    test.equal(2, item.c);

    const items = await collection.find({ a: 1 }, { projection: { _id: 0 } }).toArray();
    const firstItem = items[0];
    expect(firstItem._id).to.not.exist;
    test.equal(1, firstItem.a);
    test.equal(2, firstItem.c);
  });

  it('should correctly project a slice of an array', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const collection = await db.createCollection(
      'Should_correctly_execute_find_and_findOne_queries_in_the_same_way'
    );
    const doc = {
      _id: new ObjectId(),
      a: 1,
      c: 2,
      comments: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    };
    // insert doc
    await collection.insertOne(doc, configuration.writeConcernMax());
    const docs = await collection
      .find({ _id: doc._id })
      .project({ comments: { $slice: -5 } })
      .toArray();
    test.equal(5, docs[0].comments.length);
  });

  it('should correctly handler error for findOneAndUpdate when no record exists', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const collection = await db.createCollection(
      'shouldCorrectlyHandlerErrorForfindOneAndUpdateWhenNoRecordExists'
    );
    const updated_doc = await collection.findOneAndUpdate(
      { a: 1 },
      { $set: { b: 3 } },
      { returnDocument: ReturnDocument.AFTER, includeResultMetadata: true }
    );
    expect(updated_doc.value).to.not.exist;
  });

  it('should correctly execute findOneAndUpdate should generate correct BSON', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    interface FinancialTransaction {
      document: {
        type: string;
        id: ObjectId;
      };
      transactionId: ObjectId;
      amount: number;
    }
    const transaction: FinancialTransaction = {
      document: {
        type: 'documentType',
        id: new ObjectId()
      },
      transactionId: new ObjectId(),
      amount: 12.3333
    };

    const transactions = [];
    transactions.push(transaction);
    // Wrapping object
    const wrapingObject = {
      funds: { remaining: 100.5 },
      transactions: transactions
    };

    const collection = await db.createCollection<{
      funds: { remaining: number };
      transactions: FinancialTransaction[];
    }>('find_and_modify_generate_correct_bson');

    const r = await collection.insertOne(wrapingObject, configuration.writeConcernMax());
    const item = await collection.findOne({
      _id: r.insertedId,
      'funds.remaining': { $gte: 3.0 },
      'transactions.id': { $ne: transaction.transactionId }
    });
    test.ok(item != null);

    const result = await collection.findOneAndUpdate(
      {
        _id: r.insertedId,
        'funds.remaining': { $gte: 3.0 },
        'transactions.id': { $ne: transaction.transactionId }
      },
      { $push: { transactions: transaction } },
      { returnDocument: ReturnDocument.AFTER, includeResultMetadata: true }
    );

    expect(result.ok).to.equal(1);

    const updatedDocument = result.value;
    expect(updatedDocument._id).to.deep.equal(r.insertedId);
    expect(updatedDocument.transactions).to.have.lengthOf(2);
    expect(updatedDocument.funds.remaining).to.equal(100.5);
  });

  it('should correctly execute multiple finds in parallel', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const collection = await db.createCollection('tasks');

    await collection.insertOne({ a: 2, b: 2 }, configuration.writeConcernMax());

    const query = {
      user_id: '4e9fc8d55883d90100000003',
      lc_status: { $ne: 'deleted' }
    };

    const options = { limit: 10 };

    const findPromise1 = collection.find(query, options).toArray();
    const findPromise2 = collection.find(query, options).toArray();

    const [results1, results2] = await Promise.all([findPromise1, findPromise2]);

    expect(results1).to.be.an('array');
    expect(results2).to.be.an('array');
  });

  it('should correctly return error from mongodb on findOneAndUpdate forced error', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const collection = await db.createCollection(
      'shouldCorrectlyReturnErrorFromMongodbOnfindOneAndUpdateForcedError'
    );
    const q = { x: 1 };
    const set = { y: 2, _id: new ObjectId() };
    const opts = {
      returnDocument: ReturnDocument.AFTER,
      upsert: true,
      includeResultMetadata: true
    };
    const doc = { _id: new ObjectId(), x: 1 };

    await collection.insertOne(doc, configuration.writeConcernMax());
    // try to update _id
    const err = await collection.findOneAndUpdate(q, { $set: set }, opts).catch(err => err);
    expect(err).to.be.instanceOf(MongoServerError);
    expect(err.message).to.include('immutable field');
  });

  // TODO(NODE-7219): Remove test as it doesn't test any find* operations
  // it('shouldCorrectlyExecutefindOneAndUpdateUnderConcurrentLoad', {
  //   metadata: {
  //     requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  //   },
  //
  //   test: function (done) {
  //     var configuration = this.configuration;
  //     var p_client = configuration.newClient(configuration.writeConcernMax(), {
  //       maxPoolSize: 1
  //     });
  //     var running = true;
  //
  //     p_client.connect(function (err, client) {
  //       var db = client.db(configuration.db);
  //       // Create a collection
  //       db.createCollection('collection1', function (err, collection) {
  //         // Wait a bit and then execute something that will throw a duplicate error
  //         setTimeout(function () {
  //           var id = new ObjectId();
  //
  //           collection.insert({ _id: id, a: 1 }, configuration.writeConcernMax(), function (err) {
  //             expect(err).to.not.exist;
  //
  //             collection.insert({ _id: id, a: 1 }, configuration.writeConcernMax(), function (err) {
  //               test.ok(err !== null);
  //               running = false;
  //               p_client.close(done);
  //             });
  //           });
  //         }, 200);
  //       });
  //
  //       db.createCollection('collection2', function (err, collection) {
  //         // Keep hammering in inserts
  //         var insert;
  //         insert = function () {
  //           process.nextTick(function () {
  //             collection.insert({ a: 1 });
  //             if (running) process.nextTick(insert);
  //           });
  //         };
  //       });
  //     });
  //   }
  // });

  it('should correctly iterate over collection', async function () {
    const db = client.db(this.configuration.db);

    const collection = db.collection('shouldCorrectlyIterateOverCollection');
    // Insert 500 documents
    const docsToInsert = Array.from({ length: 500 }, () => ({
      a: 1,
      b: 2,
      c: { d: 3, f: 'sfdsffffffffffffffffffffffffffffff' }
    }));
    await collection.insertMany(docsToInsert);

    let iteratedCount = 0;
    const cursor = collection.find({});

    for await (const doc of cursor) {
      expect(doc).to.exist;
      iteratedCount++;
    }

    expect(iteratedCount).to.equal(500);
  });

  it('should correctly error out findOneAndUpdate on duplicate record', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);

    const collection = await db.createCollection(
      'shouldCorrectlyErrorOutfindOneAndUpdateOnDuplicateRecord'
    );

    // Test return old document on change
    const r = await collection.insertMany(
      [{ login: 'user1' }, { login: 'user2' }],
      configuration.writeConcernMax()
    );
    const id = r.insertedIds[1];
    // Set an index
    await collection.createIndex('login', { unique: true });

    // Attemp to modify document
    const err = await collection
      .findOneAndUpdate({ _id: id }, { $set: { login: 'user1' } }, { includeResultMetadata: true })
      .catch(err => err);
    expect(err).to.be.instanceof(MongoServerError);
  });

  it('should perform find with large $in parameter', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);

    // Create a collection we want to drop later
    const collection = await db.createCollection('simple_find_in_array');

    const docs = [];
    for (let i = 0; i < 100; i++) docs.push({ a: i });

    await collection.insertMany(docs, configuration.writeConcernMax());

    // Find all the constiables in a specific array
    for (let i = 0; i < 100; i++) docs.push(i);

    const items = await collection.find({ a: { $in: docs } }).toArray();
    test.equal(100, items.length);
  });

  it('should error with invalid projection', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);

    const col = db.collection('bad_field_selection');
    await col.insertMany(
      [
        { a: 1, b: 1 },
        { a: 2, b: 2 },
        { a: 3, b: 3 }
      ],
      configuration.writeConcernMax()
    );

    const err = await col
      .find({}, { skip: 1, limit: 1, projection: { a: 1, b: 0 } })
      .toArray()
      .catch(err => err);
    expect(err).to.be.instanceof(MongoServerError);
    expect(err.message).to.include('exclusion');
  });

  it('should perform a simple find with project fields', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);

    const collection = await db.createCollection('simple_find_with_fields');
    await collection.insertMany(
      [
        { a: 1, b: 1 },
        { a: 2, b: 2 },
        { a: 3, b: 3 }
      ],
      configuration.writeConcernMax()
    );

    const docs = await collection.find({ a: 2 }).project({ b: 1 }).toArray();
    test.equal(1, docs.length);
    expect(docs[0].a).to.not.exist;
    test.equal(2, docs[0].b);
  });

  // TODO(NODE-7219): Remove test as it duplicates "should perform a simple find with project fields"
  // it('shouldPerformASimpleLimitSkipFindWithFields2', {
  //   metadata: {
  //     requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  //   },
  //
  //   test: function (done) {
  //     var configuration = this.configuration;
  //     var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
  //     client.connect(function (err, client) {
  //       var db = client.db(configuration.db);
  //
  //       // Create a collection we want to drop later
  //       db.createCollection('simple_find_with_fields_2', function (err, collection) {
  //         expect(err).to.not.exist;
  //
  //         // Insert a bunch of documents for the testing
  //         collection.insert(
  //           [
  //             { a: 1, b: 1 },
  //             { a: 2, b: 2 },
  //             { a: 3, b: 3 }
  //           ],
  //           configuration.writeConcernMax(),
  //           function (err) {
  //             expect(err).to.not.exist;
  //
  //             // Perform a simple find and return all the documents
  //             collection
  //               .find({ a: 2 })
  //               .project({ b: 1 })
  //               .toArray(function (err, docs) {
  //                 expect(err).to.not.exist;
  //                 test.equal(1, docs.length);
  //                 expect(docs[0].a).to.not.exist;
  //                 test.equal(2, docs[0].b);
  //
  //                 client.close(done);
  //               });
  //           }
  //         );
  //       });
  //     });
  //   }
  // });

  it('should perform query with batchSize different to standard', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);

    const collection = await db.createCollection(
      'shouldPerformQueryWithBatchSizeDifferentToStandard'
    );

    const docs = [];
    for (let i = 0; i < 1000; i++) {
      docs.push({ a: i });
    }

    await collection.insertMany(docs, configuration.writeConcernMax());

    // Perform a simple find and return all the documents
    const documents = await collection.find({}, { batchSize: 1000 }).toArray();
    test.equal(1000, documents.length);
  });

  // TODO(NODE-7219): Remove test as it duplicates "should execute query using negative limit"
  // it('shouldCorrectlyPerformNegativeLimit', {
  //   metadata: {
  //     requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  //   },
  //
  //   test: function (done) {
  //     const configuration = this.configuration;
  //     const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
  //     client.connect(function (err, client) {
  //       const db = client.db(configuration.db);
  //
  //       // Create a collection we want to drop later
  //       const collection = db.collection('shouldCorrectlyPerformNegativeLimit');
  //       const docs = [];
  //       for (const i = 0; i < 1000; i++) {
  //         docs.push({
  //           a: 1,
  //           b: 'helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld'
  //         });
  //       }
  //
  //       // Insert a bunch of documents
  //       collection.insert(docs, configuration.writeConcernMax(), function (err) {
  //         expect(err).to.not.exist;
  //
  //         // Perform a simple find and return all the documents
  //         collection
  //           .find({})
  //           .limit(-10)
  //           .toArray(function (err, docs) {
  //             expect(err).to.not.exist;
  //             test.equal(10, docs.length);
  //
  //             client.close(done);
  //           });
  //       });
  //     });
  //   }
  // });

  // TODO(NODE-7219): Remove test as "exhaust" is deprecated
  // it('shouldCorrectlyExecuteExhaustQuery', {
  //   metadata: { requires: { topology: ['single', 'replicaset'] } },
  //
  //   test: function (done) {
  //     const configuration = this.configuration;
  //     const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
  //     client.connect(function (err, client) {
  //       const db = client.db(configuration.db);
  //
  //       // Create a collection we want to drop later
  //       db.createCollection('shouldCorrectlyExecuteExhaustQuery', function (err, collection) {
  //         expect(err).to.not.exist;
  //
  //         const docs1 = [];
  //         for (const i = 0; i < 1000; i++) {
  //           docs1.push({
  //             a: 1,
  //             b: 'helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld',
  //             c: new Binary(Buffer.alloc(1024))
  //           });
  //         }
  //
  //         // Insert a bunch of documents
  //         collection.insert(docs1, configuration.writeConcernMax(), function (err) {
  //           expect(err).to.not.exist;
  //
  //           for (const i = 0; i < 1000; i++) {
  //             const docs2 = [];
  //             docs2.push({
  //               a: 1,
  //               b: 'helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld',
  //               c: new Binary(Buffer.alloc(1024))
  //             });
  //           }
  //
  //           collection.insert(docs2, configuration.writeConcernMax(), function (err) {
  //             expect(err).to.not.exist;
  //
  //             // Perform a simple find and return all the documents
  //             collection.find({}, { exhaust: true }).toArray(function (err, docs3) {
  //               expect(err).to.not.exist;
  //               test.equal(docs1.length + docs2.length, docs3.length);
  //
  //               client.close(done);
  //             });
  //           });
  //         });
  //       });
  //     });
  //   }
  // });

  // TODO(NODE-7219): Remove test as it duplicates "should respect client-level read preference"
  // it('Readpreferences should work fine when using a single server instance', {
  //   metadata: {
  //     requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  //   },
  //
  //   test: function (done) {
  //     const configuration = this.configuration;
  //     const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
  //
  //     client.connect(function (err, client) {
  //       const db = client.db(configuration.db);
  //       expect(err).to.not.exist;
  //
  //       const docs = [];
  //       for (const i = 0; i < 1; i++) {
  //         docs.push({
  //           a: 1,
  //           b: 'helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld'
  //         });
  //       }
  //
  //       // Create a collection we want to drop later
  //       db.createCollection('Readpreferencesshouldworkfine', function (err, collection) {
  //         // Insert a bunch of documents
  //         collection.insert(docs, configuration.writeConcernMax(), function (err) {
  //           expect(err).to.not.exist;
  //           // Perform a simple find and return all the documents
  //           collection.find({}, { exhaust: true }).toArray(function (err, docs2) {
  //             expect(err).to.not.exist;
  //             test.equal(docs.length, docs2.length);
  //
  //             client.close(done);
  //           });
  //         });
  //       });
  //     });
  //   }
  // });

  it('should correctly iterate over an empty cursor', async function () {
    const collection = client.db().collection('empty_collection_for_iteration');
    let iteratedCount = 0;
    for await (const _ of collection.find({})) {
      iteratedCount++;
    }
    expect(iteratedCount).to.equal(0);
  });

  it('should correctly find documents by regExp', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    // Serialized regexes contain extra trailing chars. Sometimes these trailing chars contain / which makes
    // the original regex invalid, and leads to segmentation fault.
    const collection = await db.createCollection('test_regex_serialization');
    await collection.insertOne(
      { keywords: ['test', 'segmentation', 'fault', 'regex', 'serialization', 'native'] },
      configuration.writeConcernMax()
    );

    for (let i = 0; i <= 20; ++i) {
      // search by regex
      const item = await collection.findOne({
        keywords: { $all: [/ser/, /test/, /seg/, /fault/, /nat/] }
      });
      expect(item).property('keywords').to.have.length(6);
    }
  });

  // TODO(NODE-7219): Remove test as it duplicates "should correctly perform find with options"
  // it('shouldCorrectlyDoFindMinMax', {
  //   metadata: {
  //     requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  //   },
  //
  //   test: function (done) {
  //     const configuration = this.configuration;
  //     const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
  //     client.connect(function (err, client) {
  //       const db = client.db(configuration.db);
  //       // Serialized regexes contain extra trailing chars. Sometimes these trailing chars contain / which makes
  //       // the original regex invalid, and leads to segmentation fault.
  //       db.createCollection('shouldCorrectlyDoFindMinMax', function (err, collection) {
  //         collection.insert(
  //           { _id: 123, name: 'some name', min: 1, max: 10 },
  //           configuration.writeConcernMax(),
  //           function (err) {
  //             expect(err).to.not.exist;
  //
  //             collection
  //               .find({ _id: { $in: ['some', 'value', 123] } })
  //               .project({ _id: 1, max: 1 })
  //               .toArray(function (err, docs) {
  //                 expect(err).to.not.exist;
  //                 test.equal(10, docs[0].max);
  //
  //                 collection
  //                   .find(
  //                     { _id: { $in: ['some', 'value', 123] } },
  //                     { projection: { _id: 1, max: 1 } }
  //                   )
  //                   .toArray(function (err, docs) {
  //                     expect(err).to.not.exist;
  //                     test.equal(10, docs[0].max);
  //
  //                     client.close(done);
  //                   });
  //               });
  //           }
  //         );
  //       });
  //     });
  //   }
  // });

  it('should correctly sort using text search in find', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);

    // Get the collection
    const collection = db.collection('textSearchWithSort');
    await collection.createIndex({ s: 'text' });

    await collection.insertMany([
      { s: 'spam' },
      { s: 'spam eggs and spam' },
      { s: 'sausage and eggs' }
    ]);

    const items = await collection
      .find(
        { $text: { $search: 'spam' } },
        { projection: { _id: false, s: true, score: { $meta: 'textScore' } } }
      )
      .sort({ score: { $meta: 'textScore' } })
      .toArray();
    test.equal('spam eggs and spam', items[0].s);
  });

  it('should not mutate user-provided options', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const collection = db.collection('shouldNotMutateUserOptions');
    const options = { raw: 'TEST' };
    // @ts-expect-error: intentionally passing an invalid option
    await collection.find({}, options).toArray();
    expect(options).to.not.have.property('skip');
    expect(options).to.not.have.property('limit');
    test.equal('TEST', options.raw);
  });

  it('should correctly execute a findOneAndUpdate with a writeConcern', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const collection = await db.createCollection('test_find_and_modify_a_document_3');
    // Test return new document on change
    await collection.insertOne({ a: 1, b: 2 }, configuration.writeConcernMax());

    // Let's modify the document in place
    const updated_doc = await collection.findOneAndUpdate(
      { a: 1 },
      { $set: { b: 3 } },
      { returnDocument: ReturnDocument.AFTER, includeResultMetadata: true }
    );
    expect(updated_doc.value.a).to.equal(1);
    expect(updated_doc.value.b).to.equal(3);
  });

  it('should execute query using negative batchSize', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const collection = db.collection('test_find_simple_batchsize_0');
    // Insert some test documents
    await collection.insertMany([{ a: 2 }, { b: 3 }, { b: 4 }], configuration.writeConcernMax());
    // Ensure correct insertion testing via the cursor and the count function
    const documents = await collection.find().batchSize(-5).toArray();
    test.equal(3, documents.length);
  });

  it('should execute query using negative limit', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const collection = db.collection('test_find_simple_limit_0');

    // Insert some test documents
    await collection.insertMany([{ a: 2 }, { b: 3 }, { b: 4 }], configuration.writeConcernMax());
    // Ensure correct insertion testing via the cursor and the count function
    const documents = await collection.find().limit(-5).toArray();
    test.equal(3, documents.length);
  });

  it('should execute query using $elemMatch', async function () {
    const configuration = this.configuration;
    const db = client.db(configuration.db);
    const collection = db.collection<{ _id: number; results: number[] }>('elem_match_test');
    // Insert some test documents
    await collection.insertMany(
      [
        { _id: 1, results: [82, 85, 88] },
        { _id: 2, results: [75, 88, 89] }
      ],
      configuration.writeConcernMax()
    );
    // Ensure correct insertion testing via the cursor and the count function
    const documents = await collection
      .find({ results: { $elemMatch: { $gte: 80, $lt: 85 } } })
      .toArray();
    test.deepEqual([{ _id: 1, results: [82, 85, 88] }], documents);
  });

  // TODO(NODE-7219): Remove test as it duplicates "should correctly perform find with limit"
  // it('should execute query using limit of 101', {
  //   metadata: {
  //     requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  //   },
  //
  //   test: function (done) {
  //     var configuration = this.configuration;
  //     var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
  //     client.connect(function (err, client) {
  //       var db = client.db(configuration.db);
  //       const collection = db.collection('test_find_simple_limit_101');
  //       function clone(obj) {
  //         var o = {};
  //         for (var name in obj) o[name] = obj[name];
  //         return o;
  //       }
  //
  //       var template = {
  //         linkid: '12633170',
  //         advertisercid: '4612127',
  //         websitename: 'Car Rental 8',
  //         destinationurl: 'https://www.carrental8.com/en/',
  //         who: '8027061-12633170-1467924618000',
  //         href: 'http://www.tkqlhce.com',
  //         src: 'http://www.awltovhc.com',
  //         r1: 3,
  //         r2: 44,
  //         r3: 24,
  //         r4: 58
  //       };
  //
  //       var docs = [];
  //       for (var i = 0; i < 1000; i++) {
  //         docs.push(clone(template));
  //       }
  //
  //       // Insert some test documents
  //       collection.insertMany(docs, configuration.writeConcernMax(), function (err, r) {
  //         expect(err).to.not.exist;
  //         test.ok(r);
  //
  //         // Ensure correct insertion testing via the cursor and the count function
  //         collection
  //           .find()
  //           .limit(200)
  //           .toArray(function (err, documents) {
  //             expect(err).to.not.exist;
  //             test.equal(200, documents.length);
  //             // Let's close the db
  //             client.close(done);
  //           });
  //       });
  //     });
  //   }
  // });

  it('should correctly apply db level options to find cursor', async function () {
    const configuration = this.configuration;
    const p_client = configuration.newClient({}, { ignoreUndefined: true });
    await p_client.connect();
    const db = p_client.db(configuration.db);
    const collection = db.collection('test_find_simple_cursor_inheritance');

    // Insert some test documents
    await collection.insertMany([{ a: 2 }, { b: 3, c: undefined }]);

    const cursor = collection.find({ c: { $exists: false } });

    const documents = await cursor.toArray();
    test.equal(2, documents.length);

    await p_client.close();
  });

  it('should respect client-level read preference', {
    metadata: { requires: { topology: ['replicaset'] } },

    test: async function () {
      const config = this.configuration;
      const client = config.newClient({}, { monitorCommands: true, readPreference: 'secondary' });

      await client.connect();

      let selectedServer;
      const topology = client.topology;
      const selectServerStub = sinon.stub(topology, 'selectServer').callsFake(async function (
        ...args
      ) {
        const server = selectServerStub.wrappedMethod.apply(this, args);
        selectedServer = await server;
        return selectedServer;
      });

      const collection = client.db().collection('test_read_preference');
      await collection.find().toArray();
      expect(selectedServer.description.type).to.eql('RSSecondary');
      selectServerStub.restore();

      await client.close();
    }
  });

  context('when passed an ObjectId instance as the filter', () => {
    let client;
    let findsStarted;

    beforeEach(function () {
      client = this.configuration.newClient({ monitorCommands: true });
      findsStarted = [];
      client.on('commandStarted', ev => {
        if (ev.commandName === 'find') findsStarted.push(ev.command);
      });
    });

    afterEach(async function () {
      findsStarted = undefined;
      await client.close();
    });

    context('find(oid)', () => {
      it('wraps the objectId in a document with _id as the only key', async () => {
        const collection = client.db('test').collection('test');
        const oid = new ObjectId();
        await collection.find(oid).toArray();
        expect(findsStarted).to.have.lengthOf(1);
        expect(findsStarted[0]).to.have.nested.property('filter._id', oid);
        expect(findsStarted[0].filter).to.have.all.keys('_id');
      });
    });

    context('findOne(oid)', () => {
      it('wraps the objectId in a document with _id as the only key', async () => {
        const collection = client.db('test').collection('test');
        const oid = new ObjectId();
        await collection.findOne(oid);
        expect(findsStarted).to.have.lengthOf(1);
        expect(findsStarted[0]).to.have.nested.property('filter._id', oid);
        expect(findsStarted[0].filter).to.have.all.keys('_id');
      });
    });
  });

  it(
    'regression test (NODE-6878): CursorResponse.emptyGetMore contains all CursorResponse fields',
    { requires: { topology: 'sharded' } },
    async function () {
      const collection = client.db('rewind-regression').collection('bar');

      await collection.deleteMany({});
      await collection.insertMany(Array.from({ length: 4 }, (_, i) => ({ x: i })));

      const getMoreSpy = sinon.spy(CursorResponse, 'emptyGetMore', ['get']);

      const cursor = collection.find({}, { batchSize: 1, limit: 3 });
      // emptyGetMore is used internally after limit + 1 documents have been iterated
      await cursor.next();
      await cursor.next();
      await cursor.next();
      await cursor.next();

      // assert that `emptyGetMore` is called.  if it is not, this test
      // always passes, even without the fix in NODE-6878.
      expect(getMoreSpy.get).to.have.been.called;

      cursor.rewind();

      await cursor.toArray();
    }
  );
});
