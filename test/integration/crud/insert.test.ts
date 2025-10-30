import * as Script from 'node:vm';

import { expect } from 'chai';
import { satisfies } from 'semver';

import {
  Binary,
  BSONSymbol,
  Code,
  type Collection,
  DBRef,
  type Document,
  Double,
  Long,
  MaxKey,
  MinKey,
  MongoBulkWriteError,
  type MongoClient,
  MongoInvalidArgumentError,
  MongoServerError,
  ObjectId,
  ReturnDocument,
  Timestamp
} from '../../../src';
import { noop } from '../../../src/utils';
import { assert as test, setupDatabase } from '../shared';

describe('crud - insert', function () {
  let client: MongoClient;

  before(async function () {
    return setupDatabase(this.configuration);
  });

  beforeEach(async function () {
    client = this.configuration.newClient();
  });

  afterEach(async function () {
    await client.close();
  });

  describe('when a pkFactory is set on the client', function () {
    let client: MongoClient;
    const pkFactory = {
      count: 0,
      createPk: function () {
        return new Double(this.count++);
      }
    };
    let collection: Collection;

    beforeEach(async function () {
      client = this.configuration.newClient({}, { pkFactory, promoteValues: false });
      collection = client.db('integration').collection('pk_factory_tests');
      await collection.deleteMany({});
    });

    afterEach(() => client.close());

    it('insertOne() generates _ids using the pkFactory', async function () {
      await collection.insertOne({ name: 'john doe' });
      const result = await collection.findOne({ name: 'john doe' });
      expect(result).to.have.property('_id').to.have.property('_bsontype').to.equal('Double');
    });
  });

  it('rejects when insertMany is passed a non array object', async function () {
    const db = client.db();
    const error = await db
      .collection('insertMany_Promise_error')
      // @ts-expect-error Not allowed in TS, but can be used in JS
      .insertMany({ a: 1 })
      .catch(error => error);
    expect(error).to.be.instanceOf(MongoInvalidArgumentError);
    expect(error.message).to.match(/must be an array/);
  });

  describe('collection.insertOne/insertMany()', function () {
    it('should correctly perform single insert', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const collection = db.collection('shouldCorrectlyPerformSingleInsert');
      const r = await collection.insertOne({ a: 1 }, configuration.writeConcernMax());
      expect(r).to.have.property('insertedId');

      const item = await collection.findOne({ _id: r.insertedId });
      expect(item.a).to.equal(1);
    });

    it('insertMany returns the insertedIds and we can look up the documents', async function () {
      const db = client.db();
      const collection = db.collection('test_multiple_insert');
      await collection.deleteMany({});
      const docs = [{ a: 1 }, { a: 2 }];

      const r = await collection.insertMany(docs);
      expect(r).property('insertedCount').to.equal(2);
      expect(r.insertedIds[0]).to.have.property('_bsontype', 'ObjectId');
      expect(r.insertedIds[1]).to.have.property('_bsontype', 'ObjectId');

      const foundDocs = await collection.find().toArray();
      expect(foundDocs).to.have.lengthOf(2);
      expect(foundDocs).to.have.nested.property('[0].a', 1);
      expect(foundDocs).to.have.nested.property('[1].a', 2);
    });

    it('should correctly insert and retrieve large integrated array document', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const collection = db.collection('test_should_deserialize_large_integrated_array');

      const doc = {
        a: 0,
        b: [
          'tmp1',
          'tmp2',
          'tmp3',
          'tmp4',
          'tmp5',
          'tmp6',
          'tmp7',
          'tmp8',
          'tmp9',
          'tmp10',
          'tmp11',
          'tmp12',
          'tmp13',
          'tmp14',
          'tmp15',
          'tmp16'
        ]
      };
      // Insert in the collection
      await collection.insertOne(doc, configuration.writeConcernMax());
      // Fetch and check the document
      const result = await collection.findOne({ a: 0 });
      test.deepEqual(doc.a, result.a);
      test.deepEqual(doc.b, result.b);
    });

    it('should correctly insert and retrieve document with all types', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const collection = db.collection('test_all_serialization_types');

      const date = new Date();
      const oid = new ObjectId();
      const string = 'binstring';
      const bin = new Binary();
      for (let index = 0; index < string.length; index++) {
        bin.put(string.charAt(index));
      }

      const motherOfAllDocuments = {
        string: 'hello',
        array: [1, 2, 3],
        hash: { a: 1, b: 2 },
        date: date,
        oid: oid,
        binary: bin,
        int: 42,
        float: 33.3333,
        regexp: /regexp/,
        boolean: true,
        long: date.getTime(),
        where: new Code('this.a > i', { i: 1 }),
        dbref: new DBRef('namespace', oid, 'integration_tests_')
      };

      await collection.insertOne(motherOfAllDocuments, configuration.writeConcernMax());
      const doc = await collection.findOne();
      // Assert correct deserialization of the values
      test.equal(motherOfAllDocuments.string, doc.string);
      test.deepEqual(motherOfAllDocuments.array, doc.array);
      test.equal(motherOfAllDocuments.hash.a, doc.hash.a);
      test.equal(motherOfAllDocuments.hash.b, doc.hash.b);
      test.equal(date.getTime(), doc.long);
      test.equal(date.toString(), doc.date.toString());
      test.equal(date.getTime(), doc.date.getTime());
      test.equal(motherOfAllDocuments.oid.toHexString(), doc.oid.toHexString());
      test.equal(motherOfAllDocuments.binary.toString('hex'), doc.binary.value().toString('hex'));

      test.equal(motherOfAllDocuments.int, doc.int);
      test.equal(motherOfAllDocuments.long, doc.long);
      test.equal(motherOfAllDocuments.float, doc.float);
      test.equal(motherOfAllDocuments.regexp.toString(), doc.regexp.toString());
      test.equal(motherOfAllDocuments.boolean, doc.boolean);
      test.equal(motherOfAllDocuments.where.code, doc.where.code);
      test.equal(motherOfAllDocuments.where.scope['i'], doc.where.scope.i);

      test.equal(motherOfAllDocuments.dbref.collection, doc.dbref.collection);
      test.equal(motherOfAllDocuments.dbref.oid.toHexString(), doc.dbref.oid.toHexString());
      test.equal(motherOfAllDocuments.dbref.db, doc.dbref.db);
    });

    it('should correctly insert and update document with new script context', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);

      const user_collection = await db.createCollection('users');
      await user_collection.deleteMany({}, configuration.writeConcernMax());

      //first, create a user object
      const user = await user_collection.insertOne(
        { name: 'Test Account', settings: {} },
        configuration.writeConcernMax()
      );
      const scriptCode = "settings.block = []; settings.block.push('test');";
      const context = { settings: { thisOneWorks: 'somestring' } };

      Script.runInNewContext(scriptCode, context, 'testScript');

      //now create update command and issue it
      const updateCommand = { $set: context };

      await user_collection.updateOne(
        { _id: user.insertedId },
        updateCommand,
        configuration.writeConcernMax()
      );
      // Fetch the object and check that the changes are persisted
      const doc = await user_collection.findOne({ _id: user.insertedId });
      test.equal('Test Account', doc.name);
      test.equal('somestring', doc.settings.thisOneWorks);
      test.equal('test', doc.settings.block[0]);
    });

    it('should correctly serialize document with all types in new context', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const collection = db.collection('test_all_serialization_types_new_context');

      const date = new Date();
      const scriptCode =
        "var string = 'binstring'\n" +
        'var bin = new mongo.Binary()\n' +
        'for(var index = 0; index < string.length; index++) {\n' +
        '  bin.put(string.charAt(index))\n' +
        '}\n' +
        "motherOfAllDocuments['string'] = 'hello';" +
        "motherOfAllDocuments['array'] = [1,2,3];" +
        "motherOfAllDocuments['hash'] = {'a':1, 'b':2};" +
        "motherOfAllDocuments['date'] = date;" +
        "motherOfAllDocuments['oid'] = new mongo.ObjectId();" +
        "motherOfAllDocuments['binary'] = bin;" +
        "motherOfAllDocuments['int'] = 42;" +
        "motherOfAllDocuments['float'] = 33.3333;" +
        "motherOfAllDocuments['regexp'] = /regexp/;" +
        "motherOfAllDocuments['boolean'] = true;" +
        "motherOfAllDocuments['long'] = motherOfAllDocuments['date'].getTime();" +
        "motherOfAllDocuments['where'] = new mongo.Code('this.a > i', {i:1});" +
        "motherOfAllDocuments['dbref'] = new mongo.DBRef('namespace', motherOfAllDocuments['oid'], 'integration_tests_');";

      const context = {
        motherOfAllDocuments: {} as any,
        mongo: {
          ObjectId: ObjectId,
          Binary: Binary,
          Code: Code,
          DBRef: DBRef
        },
        date: date
      };

      // Execute function in context
      Script.runInNewContext(scriptCode, context, 'testScript');
      // sys.puts(sys.inspect(context.motherOfAllDocuments))
      const motherOfAllDocuments = context.motherOfAllDocuments;

      await collection.insertOne(context.motherOfAllDocuments, configuration.writeConcernMax());
      const doc = await collection.findOne();
      // Assert correct deserialization of the values
      test.equal(motherOfAllDocuments.string, doc.string);
      test.deepEqual(motherOfAllDocuments.array, doc.array);
      test.equal(motherOfAllDocuments.hash.a, doc.hash.a);
      test.equal(motherOfAllDocuments.hash.b, doc.hash.b);
      test.equal(date.getTime(), doc.long);
      test.equal(date.toString(), doc.date.toString());
      test.equal(date.getTime(), doc.date.getTime());
      test.equal(motherOfAllDocuments.oid.toHexString(), doc.oid.toHexString());
      test.equal(
        motherOfAllDocuments.binary.value().toString('hex'),
        doc.binary.value().toString('hex')
      );

      test.equal(motherOfAllDocuments.int, doc.int);
      test.equal(motherOfAllDocuments.long, doc.long);
      test.equal(motherOfAllDocuments.float, doc.float);
      test.equal(motherOfAllDocuments.regexp.toString(), doc.regexp.toString());
      test.equal(motherOfAllDocuments.boolean, doc.boolean);
      test.equal(motherOfAllDocuments.where.code, doc.where.code);
      test.equal(motherOfAllDocuments.where.scope['i'], doc.where.scope.i);
      test.equal(motherOfAllDocuments.dbref.namespace, doc.dbref.namespace);
      test.equal(motherOfAllDocuments.dbref.oid.toHexString(), doc.dbref.oid.toHexString());
      test.equal(motherOfAllDocuments.dbref.db, doc.dbref.db);
    });

    it('should correctly do .toJson() for Long value', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const collection = db.collection('test_to_json_for_long');
      await collection.insertMany(
        [{ value: Long.fromNumber(32222432) }],
        configuration.writeConcernMax()
      );
      const findResult = await collection.findOne({});
      expect(findResult.value).to.deep.equal(32222432);
    });

    it('should insert and query timestamp', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const collection = db.collection('test_insert_and_query_timestamp');
      await collection.insertOne(
        { i: Timestamp.fromNumber(100), j: Long.fromNumber(200) },
        configuration.writeConcernMax()
      );
      const findResult = await collection.findOne({});
      expect(findResult.i._bsontype).equals('Timestamp');
      expect(findResult.i.toInt()).to.equal(100);
      expect(findResult.j.toString()).to.equal('200');
    });

    it('should correctly insert and query undefined', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const collection = db.collection('test_insert_and_query_undefined');

      // Insert the update
      await collection.insertOne({ i: undefined }, configuration.writeConcernMax());

      // Locate document
      const item = await collection.findOne({});
      expect(item.i).to.be.null;
    });

    it('should correctly serialize DBRef to JSON', async function () {
      const dbref = new DBRef(
        'foo',
        ObjectId.createFromHexString('fc24a04d4560531f00000000'),
        null
      );
      JSON.stringify(dbref);
    });

    it('should correctly insert document with UUID', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const collection = db.collection<{ _id: Binary; field: string }>('insert_doc_with_uuid');

      // Generate a binary id
      const binaryUUID = new Binary(
        Buffer.from('00000078123456781234567812345678', 'hex'),
        Binary.SUBTYPE_UUID
      );

      // UUID must be 16 bytes
      expect(binaryUUID.buffer).to.have.property('byteLength', 16);

      await collection.insertOne({ _id: binaryUUID, field: '2' }, configuration.writeConcernMax());
      const docs = await collection.find({ _id: binaryUUID }).toArray();
      test.equal(docs[0].field, '2');
    });

    it('should correctly insert DBRef with Db not defined', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const collection = db.collection('shouldCorrectlyInsertDBRefWithDbNotDefined');

      const doc = { _id: new ObjectId() };
      const doc2 = {
        _id: new ObjectId(),
        ref: new DBRef('shouldCorrectlyInsertDBRefWithDbNotDefined', doc._id)
      };
      const doc3 = {
        _id: new ObjectId(),
        ref: new DBRef('shouldCorrectlyInsertDBRefWithDbNotDefined', doc._id, undefined)
      };

      await collection.insertOne(doc, configuration.writeConcernMax());

      await collection.insertMany([doc2, doc3], configuration.writeConcernMax());

      // Get all items
      const items = await collection.find().toArray();
      test.equal('shouldCorrectlyInsertDBRefWithDbNotDefined', items[1].ref.namespace);
      test.equal(doc._id.toString(), items[1].ref.oid.toString());
      expect(items[1].ref.db).to.not.exist;

      test.equal('shouldCorrectlyInsertDBRefWithDbNotDefined', items[2].ref.namespace);
      test.equal(doc._id.toString(), items[2].ref.oid.toString());
      expect(items[2].ref.db).to.not.exist;
    });

    it('should correctly insert object and retrieve it when containing array and IsoDate', async function () {
      const configuration = this.configuration;
      const doc = {
        _id: new ObjectId('4e886e687ff7ef5e00000162'),
        str: 'foreign',
        type: 2,
        timestamp: new Date('2011-10-02T14:00:08.383Z'),
        links: [
          'http://www.reddit.com/r/worldnews/comments/kybm0/uk_home_secretary_calls_for_the_scrapping_of_the/'
        ]
      };

      const db = client.db(configuration.db);
      const collection = db.collection(
        'Should_correctly_insert_object_and_retrieve_it_when_containing_array_and_IsoDate'
      );

      await collection.insertOne(doc, configuration.writeConcernMax());

      const item = await collection.findOne();
      test.deepEqual(doc, item);
    });

    it('inserts and retrieves objects with timestamps', async function () {
      const doc = {
        _id: new ObjectId('4e886e687ff7ef5e00000162'),
        str: 'foreign',
        type: 2,
        timestamp: new Timestamp({ i: 10000, t: 0 }),
        links: [
          'http://www.reddit.com/r/worldnews/comments/kybm0/uk_home_secretary_calls_for_the_scrapping_of_the/'
        ],
        timestamp2: new Timestamp({ i: 33333, t: 0 })
      };

      const db = client.db();
      const collection = db.collection('Should_correctly_insert_object_with_timestamps');
      await collection.deleteMany({});

      const { insertedId } = await collection.insertOne(doc);
      expect(insertedId.equals(doc._id)).to.be.true;
      const result = await collection.findOne({ timestamp: new Timestamp({ i: 10000, t: 0 }) });
      expect(result).to.deep.equal(doc);
    });

    it('should Correctly allow for control of serialization of functions on command level', async function () {
      const configuration = this.configuration;

      const doc = {
        str: 'String',
        func: noop
      };

      const db = client.db(configuration.db);
      const collection = db.collection(
        'Should_Correctly_allow_for_control_of_serialization_of_functions_on_command_level'
      );
      await collection.insertOne(doc, configuration.writeConcernMax());

      const result = await collection.updateOne(
        { str: 'String' },
        { $set: { c: 1, d: noop } },
        { writeConcern: { w: 1 }, serializeFunctions: false }
      );
      expect(result).property('matchedCount').to.equal(1);

      const item = await collection.findOne({ str: 'String' });
      expect(item.d).to.not.exist;

      // Execute a safe insert with replication to two servers
      const updateResult = await collection.findOneAndUpdate(
        { str: 'String' },
        { $set: { f: noop } },
        {
          returnDocument: ReturnDocument.AFTER,
          serializeFunctions: true,
          includeResultMetadata: true
        }
      );
      test.ok(updateResult.value.f._bsontype === 'Code');
    });

    it('should correctly allow for control of serialization of functions on collection level', async function () {
      const configuration = this.configuration;

      const doc = {
        str: 'String',
        func: noop
      };

      const db = client.db(configuration.db);
      const collection = db.collection(
        'Should_Correctly_allow_for_control_of_serialization_of_functions_on_collection_level',
        { serializeFunctions: true }
      );
      await collection.insertOne(doc, configuration.writeConcernMax());

      const item = await collection.findOne({ str: 'String' });
      test.ok(item.func._bsontype === 'Code');
    });

    it('should correctly allow for using a Date object as _id', async function () {
      const doc = {
        _id: new Date(),
        str: 'hello'
      };

      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const collection = db.collection<{ _id: Date }>(
        'Should_Correctly_allow_for_using_a_Date_object_as__id'
      );
      await collection.insertOne(doc, configuration.writeConcernMax());

      const item = await collection.findOne({ str: 'hello' });
      test.ok(item._id instanceof Date);
    });

    it('should not fail when update returning 0 results', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const collection = db.collection('Should_Correctly_fail_to_update_returning_0_results');
      const r = await collection.updateMany(
        { a: 1 },
        { $set: { a: 1 } },
        configuration.writeConcernMax()
      );
      expect(r).property('matchedCount').to.equal(0);
    });

    it('should correctly update two fields including a sub field', async function () {
      const configuration = this.configuration;
      const doc = {
        _id: new ObjectId(),
        Prop1: 'p1',
        Prop2: 'p2',
        More: {
          Sub1: 's1',
          Sub2: 's2',
          Sub3: 's3'
        }
      };

      const db = client.db(configuration.db);
      const collection = db.collection('Should_Correctly_update_two_fields_including_a_sub_field');
      await collection.insertOne(doc, configuration.writeConcernMax());

      // Update two fields
      const r = await collection.updateOne(
        { _id: doc._id },
        { $set: { Prop1: 'p1_2', 'More.Sub2': 's2_2' } },
        configuration.writeConcernMax()
      );
      expect(r).property('matchedCount').to.equal(1);

      const item = await collection.findOne({ _id: doc._id });
      test.equal('p1_2', item.Prop1);
      test.equal('s2_2', item.More.Sub2);
    });

    it('should correctly fail due to duplicate key for _id', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const collection = db.collection<{ _id: number }>(
        'Should_Correctly_update_two_fields_including_a_sub_field_2'
      );

      await collection.insertOne({ _id: 1 }, configuration.writeConcernMax());

      // Update two fields
      const err = await collection
        .insertOne({ _id: 1 }, configuration.writeConcernMax())
        .catch(err => err);
      expect(err).to.be.instanceOf(MongoServerError);
    });

    // TODO(7219): remove as it's redundant (custom ids are used in multiple other tests: "with UUID", "Date object as _id")
    // it('shouldCorrectlyInsertDocWithCustomId', {
    //   // Add a tag that our runner can trigger on
    //   // in this case we are setting that node needs to be higher than 0.10.X to run
    //   metadata: {
    //     requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    //   },
    //
    //   test: function (done) {
    //     const configuration = this.configuration;
    //     const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
    //     client.connect(function (err, client) {
    //       const db = client.db(configuration.db);
    //       const collection = db.collection('shouldCorrectlyInsertDocWithCustomId');
    //       // Insert the update
    //       collection.insert(
    //         { _id: 0, test: 'hello' },
    //         configuration.writeConcernMax(),
    //         function (err, result) {
    //           expect(err).to.not.exist;
    //           test.ok(result);
    //
    //           collection.findOne({ _id: 0 }, function (err, item) {
    //             test.equal(0, item._id);
    //             test.equal('hello', item.test);
    //             client.close(done);
    //           });
    //         }
    //       );
    //     });
    //   }
    // });

    it('should correctly perform upsert against new document and existing one', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const collection = db.collection(
        'shouldCorrectlyPerformUpsertAgainstNewDocumentAndExistingOne'
      );

      // Upsert a new doc
      const u1 = await collection.updateOne(
        { a: 1 },
        { $set: { a: 1 } },
        { upsert: true, writeConcern: { w: 1 } }
      );
      expect(u1).property('upsertedCount').to.equal(1);

      // Upsert an existing doc
      const u2 = await collection.updateOne(
        { a: 1 },
        { $set: { a: 1 } },
        { upsert: true, writeConcern: { w: 1 } }
      );
      expect(u2).property('matchedCount').to.equal(1);
    });

    it('should correctly perform large text insert', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const collection = db.collection('shouldCorrectlyPerformLargeTextInsert');

      // Create large string, insert and then retrieve
      const string = 'a'.repeat(50000);

      await collection.insertOne({ a: 1, string: string }, configuration.writeConcernMax());

      const doc = await collection.findOne({ a: 1 });
      test.equal(50000, doc.string.length);
    });

    it('should correctly perform insert of objects using toBSON', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const collection = db.collection('shouldCorrectlyPerformInsertOfObjectsUsingToBSON');

      // Create document with toBSON method
      const doc: Document = { a: 1, b: 1 };
      doc.toBSON = function () {
        return { c: this.a };
      };

      await collection.insertOne(doc, configuration.writeConcernMax());

      const result = await collection.findOne({ c: 1 });
      test.deepEqual(1, result.c);
    });

    it('handles BSON type inserts', async function () {
      const configuration = this.configuration;

      const document = {
        symbol: new BSONSymbol('abcdefghijkl'),
        string: 'abcdefghijkl',
        objid: new ObjectId(Buffer.alloc(12, 1)),
        double: new Double(1),
        binary: new Binary(Buffer.from('hello world')),
        minkey: new MinKey(),
        maxkey: new MaxKey(),
        code: new Code('function () {}', { a: 55 })
      };

      const db = client.db(configuration.db);
      const collection = db.collection('bson_types_insert_1');

      await collection.insertOne(document, configuration.writeConcernMax());

      const doc = await collection.findOne({ symbol: new BSONSymbol('abcdefghijkl') });
      test.equal('abcdefghijkl', doc.symbol.toString());

      const doc1 = await collection.findOne({ string: 'abcdefghijkl' });
      test.equal('abcdefghijkl', doc1.string);

      const doc2 = await collection.findOne({ objid: new ObjectId(Buffer.alloc(12, 1)) });
      test.equal('01'.repeat(12), doc2.objid.toString());

      const doc3 = await collection.findOne({ double: new Double(1) });
      test.equal(1, doc3.double);

      const doc4 = await collection.findOne({ binary: new Binary(Buffer.from('hello world')) });
      test.equal('hello world', doc4.binary.toString());

      const doc5 = await collection.findOne({ minkey: new MinKey() });
      test.ok(doc5.minkey._bsontype === 'MinKey');

      const doc6 = await collection.findOne({ maxkey: new MaxKey() });
      test.ok(doc6.maxkey._bsontype === 'MaxKey');

      const doc7 = await collection.findOne({ code: new Code('function () {}', { a: 55 }) });
      test.equal('abcdefghijkl', doc7.string);
    });

    it('lookups for timestamp and date work', async function () {
      const db = client.db();
      const collection = db.collection('timestamp_date');

      const d = new Date();
      const documents = [{ x: new Timestamp({ i: 1, t: 2 }) }, { x: d }];

      const result = await collection.insertMany(documents);
      test.ok(result);

      const doc = await collection.findOne({ x: new Timestamp({ i: 1, t: 2 }) });
      expect(doc).to.not.be.null;

      const docDate = await collection.findOne({ x: d });
      expect(docDate).to.not.be.null;
    });

    it('positive and negative infinity', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const collection = db.collection('negative_pos');

      const document = {
        pos: Number.POSITIVE_INFINITY,
        neg: Number.NEGATIVE_INFINITY
      };

      await collection.insertOne(document, configuration.writeConcernMax());

      const doc = await collection.findOne({});
      test.equal(Number.POSITIVE_INFINITY, doc.pos);
      test.equal(Number.NEGATIVE_INFINITY, doc.neg);
    });

    it('should correctly insert simple regExp document', async function () {
      const regexp = /foobar/i;

      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const collection = await db.createCollection('test_regex');
      await collection.insertOne({ b: regexp }, configuration.writeConcernMax());

      const items = await collection.find({}).project({ b: 1 }).toArray();
      test.equal('' + regexp, '' + items[0].b);
    });

    it('should correctly insert simple UTF8 regExp', async function () {
      if (satisfies(process.versions.node, '22.7.0')) {
        this.skipReason = 'Node.js 22.7.0 has a UTF-8 encoding bug';
        this.skip();
      }

      const regexp = /foobaré/;

      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const collection = db.collection('shouldCorrectlyInsertSimpleUTF8Regexp');

      await collection.insertOne({ b: regexp }, configuration.writeConcernMax());

      const items = await collection.find({}).project({ b: 1 }).toArray();
      test.equal('' + regexp, '' + items[0].b);
    });

    it('should throw due to illegal collection name', function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const k = Buffer.alloc(15);
      for (let i = 0; i < 15; i++) k[i] = 0;

      k.write('hello');
      k[6] = 0x06;
      k.write('world', 10);

      try {
        db.collection(k.toString());
        test.fail(false);
      } catch (ignore) {} // eslint-disable-line
    });

    it('should correctly honor `promoteLong:false` native BSON', async function () {
      const configuration = this.configuration;
      const p_client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1,
        promoteLongs: false
      });
      await p_client.connect();
      const db = client.db(configuration.db);
      await db.collection('shouldCorrectlyHonorPromoteLong').insertOne({
        doc: Long.fromNumber(10),
        array: [[Long.fromNumber(10)]]
      });
      const doc = await db.collection('shouldCorrectlyHonorPromoteLong').findOne();

      expect(doc.doc._bsontype === 'Long');
      expect(doc.array[0][0]._bsontype === 'Long');

      await p_client.close();
    });

    it('should correctly honor promoteLong:false native BSON with getMore', async function () {
      const configuration = this.configuration;

      const p_client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1,
        promoteLongs: false
      });
      await p_client.connect();
      const db = p_client.db(configuration.db);
      await db
        .collection('shouldCorrectlyHonorPromoteLongFalseNativeBSONWithGetMore')
        .insertMany([
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) },
          { a: Long.fromNumber(10) }
        ]);

      const docs = await db
        .collection('shouldCorrectlyHonorPromoteLongFalseNativeBSONWithGetMore')
        .find({})
        .batchSize(2)
        .toArray();
      const doc = docs.pop();
      expect(doc.a._bsontype).to.equal('Long');
      await p_client.close();
    });

    it('should correctly inherit promoteLong:false native BSON with getMore', async function () {
      const db = client.db('shouldCorrectlyInheritPromoteLongFalseNativeBSONWithGetMore', {
        promoteLongs: true
      });
      const collection = db.collection('test', { promoteLongs: false });
      const doc = await collection.insertMany([
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) },
        { a: Long.fromNumber(10) }
      ]);
      test.ok(doc);

      const docs = await collection.find({}).batchSize(2).toArray();
      docs.forEach((d, i) => {
        expect(d.a, `Failed on the document at index ${i}`).to.not.be.a('number');
        expect(d.a, `Failed on the document at index ${i}`).to.have.property('_bsontype');
        expect(d.a._bsontype, `Failed on the document at index ${i}`).to.be.equal('Long');
      });
    });

    it('should correctly honor promoteLong:true native BSON', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      await db.collection('shouldCorrectlyHonorPromoteLongTrueNativeBSON').insertOne({
        doc: Long.fromNumber(10),
        array: [[Long.fromNumber(10)]]
      });

      const doc = await db.collection('shouldCorrectlyHonorPromoteLongTrueNativeBSON').findOne();
      expect(doc.doc).to.be.a('number');
      expect(doc.array[0][0]).to.be.a('number');
    });

    it('should correctly work with checkKeys', async function () {
      const configuration = this.configuration;

      const db = client.db(configuration.db);
      const result = await db.collection('shouldCorrectlyOverrideCheckKeysJSOnUpdate').updateOne(
        {
          'ps.op.t': 1
        },
        { $set: { b: 1 } },
        { checkKeys: false }
      );
      test.ok(result);
    });

    it('should correctly apply bit operator', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const col = db.collection('shouldCorrectlyApplyBitOperator');

      await col.insertOne({ a: 1, b: 1 });

      await col.updateOne({ a: 1 }, { $bit: { b: { and: 0 } } });

      const doc = await col.findOne({ a: 1 });
      test.equal(1, doc.a);
      test.equal(0, doc.b);
    });

    function trim(str) {
      return str.replace(/\n/g, '').replace(/ /g, '');
    }

    it('should correctly perform insert and update with function serialization', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const col = db.collection('shouldCorrectlyPerformInsertAndUpdateWithFunctionSerialization', {
        serializeFunctions: true
      });

      await col.insertOne({
        a: 1,
        f: function (x) {
          return x;
        }
      });

      await col.updateOne(
        { a: 1 },
        {
          $set: {
            f: function (y) {
              return y;
            }
          }
        }
      );

      const doc = await col.findOne({ a: 1 });
      test.equal(trim('function (y){return y;}'), trim(doc.f.code));
    });

    it('should correctly insert > 1000 docs using insertMany', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const col = db.collection('shouldCorrectlyAllowforMoreThanAThousandDocsInsert', {
        serializeFunctions: true
      });
      let docs = [];

      for (let i = 0; i < 2000; i++) {
        docs.push({ a: i });
      }

      const result = await col.insertMany(docs);
      expect(result).property('insertedCount').to.equal(2000);

      docs = [];
      for (let i = 0; i < 2000; i++) {
        docs.push({ a: i });
      }

      const res = await col.insertMany(docs);
      expect(res).property('insertedCount').to.equal(2000);
    });

    it('should return error on unordered insertMany with multiple unique key constraints', async () => {
      const col = client.db().collection('insertManyMultipleWriteErrors');

      await col.drop();

      const createIndexRes = await col.createIndex({ a: 1 }, { unique: true });
      expect(createIndexRes).to.equal('a_1');

      const insertManyRes = await col
        .insertMany([{ a: 1 }, { a: 2 }, { a: 1 }, { a: 3 }, { a: 1 }], { ordered: false })
        .catch(error => error);

      expect(insertManyRes).to.be.instanceOf(MongoBulkWriteError);
      expect(insertManyRes.result).to.exist;
      // Unordered will hit both the a:1 inserts
      expect(insertManyRes.result.getWriteErrors()).to.have.length(2);
    });

    it('should return error on ordered insertMany with multiple unique key constraints', async () => {
      const col = client.db().collection('insertManyMultipleWriteErrors');

      await col.drop();

      const createIndexRes = await col.createIndex({ a: 1 }, { unique: true });
      expect(createIndexRes).to.equal('a_1');

      const insertManyRes = await col
        .insertMany([{ a: 1 }, { a: 2 }, { a: 1 }, { a: 3 }, { a: 1 }], { ordered: true })
        .catch(error => error);

      expect(insertManyRes).to.be.instanceOf(MongoBulkWriteError);
      expect(insertManyRes.result).to.exist;
      // Ordered will hit only the second a:1 insert
      expect(insertManyRes.result.getWriteErrors()).to.have.length(1);
    });

    it('correctly allow forceServerObjectId for insertOne', async function () {
      const started = [];
      const succeeded = [];

      const configuration = this.configuration;
      const p_client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1,
        monitorCommands: true
      });
      p_client.on('commandStarted', function (event) {
        if (event.commandName === 'insert') started.push(event);
      });

      p_client.on('commandSucceeded', function (event) {
        if (event.commandName === 'insert') succeeded.push(event);
      });

      const db = p_client.db(configuration.db);

      await db.collection('apm_test').insertOne({ a: 1 }, { forceServerObjectId: true });
      expect(started[0].command.documents[0]._id).to.not.exist;
      await p_client.close();
    });

    it('correctly allow forceServerObjectId for insertMany', async function () {
      const started = [];
      const succeeded = [];

      const configuration = this.configuration;
      const p_client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1,
        monitorCommands: true
      });
      p_client.on('commandStarted', function (event) {
        if (event.commandName === 'insert') started.push(event);
      });

      p_client.on('commandSucceeded', function (event) {
        if (event.commandName === 'insert') succeeded.push(event);
      });

      const db = p_client.db(configuration.db);

      await db.collection('apm_test').insertMany([{ a: 1 }], { forceServerObjectId: true });
      expect(started[0].command.documents[0]._id).to.not.exist;
      await p_client.close();
    });

    it('should return correct number of ids for insertMany { ordered: true }', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const r = await db
        .collection('inserted_ids_test')
        .insertMany([{}, {}, {}], { ordered: true });
      expect(r).property('insertedCount').to.equal(3);
    });

    it('should return correct number of ids for insertMany { ordered: false }', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);
      const r = await db
        .collection('inserted_ids_test')
        .insertMany([{}, {}, {}], { ordered: false });
      expect(r).property('insertedCount').to.equal(3);
    });

    it('Insert document including sub documents', async function () {
      const configuration = this.configuration;
      const db = client.db(configuration.db);

      const shipment = {
        shipment1: 'a'
      };

      const supplier = {
        shipments: [shipment]
      };

      const product = {
        suppliers: [supplier]
      };

      const doc = {
        a: 1,
        products: [product]
      };

      await db.collection('sub_documents').insertOne(doc);

      const v = await db.collection('sub_documents').find({}).next();
      test.equal('a', v.products[0].suppliers[0].shipments[0].shipment1);
    });

    it('MongoBulkWriteError and BulkWriteResult should respect BulkWrite', async function () {
      await client.db().collection('test_insertMany_bulkResult').drop();

      const collection = client
        .db()
        .collection<{ _id: number; x: number }>('test_insertMany_bulkResult');
      const error = await collection
        .insertMany(
          [
            { _id: 2, x: 22 },
            { _id: 2, x: 22 },
            { _id: 3, x: 33 }
          ],
          { ordered: false }
        )
        .catch(err => err);
      expect(error).to.be.instanceOf(MongoBulkWriteError);
      expect(
        error.insertedCount,
        'MongoBulkWriteError.insertedCount did not respect BulkResult.nInserted'
      ).to.equal(error.result.result.nInserted);
      expect(
        error.result.insertedCount,
        'BulkWriteResult.insertedCount did not respect BulkResult.nInserted'
      ).to.equal(error.result.result.nInserted);
      expect(
        error.result.result.nInserted,
        'BulkWrite did not correctly represent the operation'
      ).to.equal(2);
    });
  });
});
