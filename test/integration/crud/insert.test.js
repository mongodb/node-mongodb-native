'use strict';
const { assert: test, ignoreNsNotFound, setupDatabase } = require('../shared');
const { format: f } = require('util');
const { expect } = require('chai');
const Script = require('vm');
const {
  Long,
  Timestamp,
  ObjectId,
  DBRef,
  BSONSymbol,
  Double,
  Binary,
  MinKey,
  MaxKey,
  Code,
  MongoBulkWriteError,
  ReturnDocument,
  MongoInvalidArgumentError
} = require('../../mongodb');
/**
 * Module for parsing an ISO 8601 formatted string into a Date object.
 *
 * @param {any} string
 */
const ISODate = function (string) {
  let match;
  if (typeof string.getTime === 'function') return string;
  else if (
    (match = string.match(
      /^(\d{4})(-(\d{2})(-(\d{2})(T(\d{2}):(\d{2})(:(\d{2})(\.(\d+))?)?(Z|((\+|-)(\d{2}):(\d{2}))))?)?)?$/
    ))
  ) {
    const date = new Date();
    date.setUTCFullYear(Number(match[1]));
    date.setUTCMonth(Number(match[3]) - 1 || 0);
    date.setUTCDate(Number(match[5]) || 0);
    date.setUTCHours(Number(match[7]) || 0);
    date.setUTCMinutes(Number(match[8]) || 0);
    date.setUTCSeconds(Number(match[10]) || 0);
    date.setUTCMilliseconds(Number('.' + match[12]) * 1000 || 0);
    if (match[13] && match[13] !== 'Z') {
      let h = Number(match[16]) || 0,
        m = Number(match[17]) || 0;
      h *= 3600000;
      m *= 60000;
      let offset = h + m;
      if (match[15] === '+') offset = -offset;
      new Date(date.valueOf() + offset);
    }
    return date;
  } else throw new Error('Invalid ISO 8601 date given.', __filename);
};
describe('crud - insert', function () {
  let client;

  beforeEach(async function () {
    client = this.configuration.newClient();
  });

  afterEach(async function () {
    await client.close();
  });

  describe('when a pkFactory is set on the client', function () {
    let client;
    const pkFactory = {
      count: 0,
      createPk: function () {
        return new Double(this.count++);
      }
    };
    let collection;

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

  it('Should correctly execute Collection.prototype.insertOne', function (done) {
    const configuration = this.configuration;
    let url = configuration.url();
    url =
      url.indexOf('?') !== -1
        ? f('%s&%s', url, 'maxPoolSize=100')
        : f('%s?%s', url, 'maxPoolSize=100');
    const client = configuration.newClient(url);
    client.connect().then(function (client) {
      const db = client.db(configuration.db);
      db.collection('insertOne')
        .insertOne({ a: 1 })
        .then(function (r) {
          expect(r).property('insertedId').to.exist;
          client.close(done);
        });
    });
  });

  it('rejects when insertMany is passed a non array object', async function () {
    const db = client.db();
    const error = await db
      .collection('insertMany_Promise_error')
      .insertMany({ a: 1 })
      .catch(error => error);
    expect(error).to.be.instanceOf(MongoInvalidArgumentError);
    expect(error.message).to.match(/must be an array/);
  });

  describe('collection.insert()', function () {
    before(function () {
      return setupDatabase(this.configuration);
    });

    it(
      'shouldCorrectlyPerformSingleInsert',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('shouldCorrectlyPerformSingleInsert');
          collection.insert({ a: 1 }, configuration.writeConcernMax(), function (err) {
            expect(err).to.not.exist;
            collection.findOne(function (err, item) {
              test.equal(1, item.a);
              client.close(done);
            });
          });
        });
      }
    );

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

    it(
      'shouldCorrectlyInsertAndRetrieveLargeIntegratedArrayDocument',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('test_should_deserialize_large_integrated_array');
          var doc = {
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
          // Insert the collection
          collection.insert(doc, configuration.writeConcernMax(), function (err) {
            expect(err).to.not.exist;
            // Fetch and check the collection
            collection.findOne({ a: 0 }, function (err, result) {
              test.deepEqual(doc.a, result.a);
              test.deepEqual(doc.b, result.b);
              client.close(done);
            });
          });
        });
      }
    );

    it(
      'shouldCorrectlyInsertAndRetrieveDocumentWithAllTypes',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('test_all_serialization_types');
          var date = new Date();
          var oid = new ObjectId();
          var string = 'binstring';
          var bin = new Binary();
          for (var index = 0; index < string.length; index++) {
            bin.put(string.charAt(index));
          }
          var motherOfAllDocuments = {
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
          collection.insert(motherOfAllDocuments, configuration.writeConcernMax(), function (err) {
            expect(err).to.not.exist;
            collection.findOne(function (err, doc) {
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
              client.close(done);
            });
          });
        });
      }
    );

    it(
      'shouldCorrectlyInsertAndUpdateDocumentWithNewScriptContext',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          //convience curried handler for functions of type 'a -> (err, result)
          function getResult(callback) {
            return function (error, result) {
              test.ok(error == null);
              return callback(result);
            };
          }
          db.createCollection(
            'users',
            getResult(function (user_collection) {
              user_collection.deleteMany({}, configuration.writeConcernMax(), function (err) {
                expect(err).to.not.exist;
                //first, create a user object
                var newUser = { name: 'Test Account', settings: {} };
                user_collection.insert(
                  [newUser],
                  configuration.writeConcernMax(),
                  getResult(function () {
                    var scriptCode = "settings.block = []; settings.block.push('test');";
                    var context = { settings: { thisOneWorks: 'somestring' } };
                    Script.runInNewContext(scriptCode, context, 'testScript');
                    //now create update command and issue it
                    var updateCommand = { $set: context };
                    user_collection.update(
                      { _id: newUser._id },
                      updateCommand,
                      configuration.writeConcernMax(),
                      getResult(function () {
                        // Fetch the object and check that the changes are persisted
                        user_collection.findOne({ _id: newUser._id }, function (err, doc) {
                          test.ok(err == null);
                          test.equal('Test Account', doc.name);
                          test.equal('somestring', doc.settings.thisOneWorks);
                          test.equal('test', doc.settings.block[0]);
                          client.close(done);
                        });
                      })
                    );
                  })
                );
              });
            })
          );
        });
      }
    );

    it(
      'shouldCorrectlySerializeDocumentWithAllTypesInNewContext',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('test_all_serialization_types_new_context');
          var date = new Date();
          var scriptCode =
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
          var context = {
            motherOfAllDocuments: {},
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
          var motherOfAllDocuments = context.motherOfAllDocuments;
          collection.insert(
            context.motherOfAllDocuments,
            configuration.writeConcernMax(),
            function (err, docs) {
              test.ok(docs);
              collection.findOne(function (err, doc) {
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
                test.equal(
                  motherOfAllDocuments.dbref.oid.toHexString(),
                  doc.dbref.oid.toHexString()
                );
                test.equal(motherOfAllDocuments.dbref.db, doc.dbref.db);
                client.close(done);
              });
            }
          );
        });
      }
    );

    it(
      'shouldCorrectlyDoToJsonForLongValue',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      async function () {
        const configuration = this.configuration;
        const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        await client.connect();
        const db = client.db(configuration.db);
        const collection = db.collection('test_to_json_for_long');
        await collection.insert(
          [{ value: Long.fromNumber(32222432) }],
          configuration.writeConcernMax()
        );
        const findResult = await collection.findOne({});
        expect(findResult.value).to.deep.equal(32222432);
        await client.close();
      }
    );

    it(
      'shouldInsertAndQueryTimestamp',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      async function () {
        const configuration = this.configuration;
        const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        await client.connect();
        const db = client.db(configuration.db);
        const collection = db.collection('test_insert_and_query_timestamp');
        await collection.insertOne(
          { i: Timestamp.fromNumber(100), j: Long.fromNumber(200) },
          configuration.writeConcernMax()
        );
        const findResult = await collection.findOne({});
        expect(findResult.i._bsontype).equals('Timestamp');
        expect(findResult.i.toInt(), 100);
        expect(findResult.j, 200);
        await client.close();
      }
    );

    it(
      'shouldCorrectlyInsertAndQueryUndefined',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('test_insert_and_query_undefined');
          // Insert the update
          collection.insert({ i: undefined }, configuration.writeConcernMax(), function (err, r) {
            expect(err).to.not.exist;
            test.ok(r);
            // Locate document
            collection.findOne({}, function (err, item) {
              expect(item.i).to.not.exist;
              client.close(done);
            });
          });
        });
      }
    );

    it(
      'shouldCorrectlySerializeDBRefToJSON',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var dbref = new DBRef(
          'foo',
          ObjectId.createFromHexString('fc24a04d4560531f00000000'),
          null
        );
        JSON.stringify(dbref);
        done();
      }
    );

    it(
      'shouldCorrectlyInsertDocumentWithUUID',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('insert_doc_with_uuid');
          collection.insert(
            { _id: '12345678123456781234567812345678', field: '1' },
            configuration.writeConcernMax(),
            function (err, result) {
              expect(err).to.not.exist;
              test.ok(result);
              collection
                .find({ _id: '12345678123456781234567812345678' })
                .toArray(function (err, items) {
                  expect(err).to.not.exist;
                  test.equal(items[0]._id, '12345678123456781234567812345678');
                  test.equal(items[0].field, '1');
                  // Generate a binary id
                  var binaryUUID = new Binary(
                    Buffer.from('00000078123456781234567812345678', 'hex'),
                    Binary.SUBTYPE_UUID
                  );
                  // UUID must be 16 bytes
                  expect(binaryUUID.buffer).to.have.property('byteLength', 16);
                  collection.insert(
                    { _id: binaryUUID, field: '2' },
                    configuration.writeConcernMax(),
                    function (err, result) {
                      expect(err).to.not.exist;
                      test.ok(result);
                      collection.find({ _id: binaryUUID }).toArray(function (err, items) {
                        expect(err).to.not.exist;
                        test.equal(items[0].field, '2');
                        client.close(done);
                      });
                    }
                  );
                });
            }
          );
        });
      }
    );

    it(
      'shouldCorrectlyCallCallbackWithDbDriverInStrictMode',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('test_insert_and_update_no_callback_strict');
          collection.insert(
            { _id: '12345678123456781234567812345678', field: '1' },
            configuration.writeConcernMax(),
            function (err, result) {
              expect(err).to.not.exist;
              test.ok(result);
              collection.updateOne(
                { _id: '12345678123456781234567812345678' },
                { $set: { field: 0 } },
                configuration.writeConcernMax(),
                function (err, r) {
                  expect(err).to.not.exist;
                  expect(r).property('matchedCount').to.equal(1);
                  client.close(done);
                }
              );
            }
          );
        });
      }
    );

    it(
      'shouldCorrectlyInsertDBRefWithDbNotDefined',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('shouldCorrectlyInsertDBRefWithDbNotDefined');
          var doc = { _id: new ObjectId() };
          var doc2 = { _id: new ObjectId() };
          var doc3 = { _id: new ObjectId() };
          collection.insert(doc, configuration.writeConcernMax(), function (err, result) {
            expect(err).to.not.exist;
            test.ok(result);
            // Create object with dbref
            doc2.ref = new DBRef('shouldCorrectlyInsertDBRefWithDbNotDefined', doc._id);
            doc3.ref = new DBRef(
              'shouldCorrectlyInsertDBRefWithDbNotDefined',
              doc._id,
              configuration.db_name
            );
            collection.insert(
              [doc2, doc3],
              configuration.writeConcernMax(),
              function (err, result) {
                expect(err).to.not.exist;
                test.ok(result);
                // Get all items
                collection.find().toArray(function (err, items) {
                  test.equal('shouldCorrectlyInsertDBRefWithDbNotDefined', items[1].ref.namespace);
                  test.equal(doc._id.toString(), items[1].ref.oid.toString());
                  expect(items[1].ref.db).to.not.exist;
                  test.equal('shouldCorrectlyInsertDBRefWithDbNotDefined', items[2].ref.namespace);
                  test.equal(doc._id.toString(), items[2].ref.oid.toString());
                  expect(items[2].ref.db).to.not.exist;
                  client.close(done);
                });
              }
            );
          });
        });
      }
    );

    it(
      'shouldCorrectlyInsertUpdateRemoveWithNoOptions',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('shouldCorrectlyInsertUpdateRemoveWithNoOptions');
          collection.insert({ a: 1 }, configuration.writeConcernMax(), function (err, result) {
            expect(err).to.not.exist;
            test.ok(result);
            collection.update(
              { a: 1 },
              { $set: { a: 2 } },
              configuration.writeConcernMax(),
              function (err, result) {
                expect(err).to.not.exist;
                test.ok(result);
                collection.deleteMany(
                  { a: 2 },
                  configuration.writeConcernMax(),
                  function (err, result) {
                    expect(err).to.not.exist;
                    test.ok(result);
                    collection.count(function (err, count) {
                      test.equal(0, count);
                      client.close(done);
                    });
                  }
                );
              }
            );
          });
        });
      }
    );

    it(
      'shouldCorrectlyExecuteMultipleFetches',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        // Search parameter
        var to = 'ralph';
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('shouldCorrectlyExecuteMultipleFetches');
          // Execute query
          collection.insert(
            { addresses: { localPart: 'ralph' } },
            configuration.writeConcernMax(),
            function (err, result) {
              expect(err).to.not.exist;
              test.ok(result);
              // Let's find our user
              collection.findOne({ 'addresses.localPart': to }, function (err, doc) {
                expect(err).to.not.exist;
                test.equal(to, doc.addresses.localPart);
                client.close(done);
              });
            }
          );
        });
      }
    );

    it(
      'shouldCorrectlyFailWhenNoObjectToUpdate',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('shouldCorrectlyFailWhenNoObjectToUpdate');
          collection.update(
            { _id: new ObjectId() },
            { $set: { email: 'update' } },
            configuration.writeConcernMax(),
            function (err, result) {
              expect(err).to.not.exist;
              expect(result).property('matchedCount').to.equal(0);
              client.close(done);
            }
          );
        });
      }
    );

    it(
      'Should correctly insert object and retrieve it when containing array and IsoDate',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var doc = {
          _id: new ObjectId('4e886e687ff7ef5e00000162'),
          str: 'foreign',
          type: 2,
          timestamp: ISODate('2011-10-02T14:00:08.383Z'),
          links: [
            'http://www.reddit.com/r/worldnews/comments/kybm0/uk_home_secretary_calls_for_the_scrapping_of_the/'
          ]
        };
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection(
            'Should_correctly_insert_object_and_retrieve_it_when_containing_array_and_IsoDate'
          );
          collection.insert(doc, configuration.writeConcernMax(), function (err, result) {
            test.ok(err == null);
            test.ok(result);
            collection.findOne(function (err, item) {
              test.ok(err == null);
              test.deepEqual(doc, item);
              client.close(done);
            });
          });
        });
      }
    );

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

    it(
      'Should Correctly allow for control of serialization of functions on command level',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var doc = {
          str: 'String',
          func: function () {}
        };
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection(
            'Should_Correctly_allow_for_control_of_serialization_of_functions_on_command_level'
          );
          collection.insert(doc, configuration.writeConcernMax(), function (err, result) {
            expect(err).to.not.exist;
            test.ok(result);
            collection.update(
              { str: 'String' },
              { $set: { c: 1, d: function () {} } },
              { writeConcern: { w: 1 }, serializeFunctions: false },
              function (err, result) {
                expect(err).to.not.exist;
                expect(result).property('matchedCount').to.equal(1);
                collection.findOne({ str: 'String' }, function (err, item) {
                  expect(item.d).to.not.exist;
                  // Execute a safe insert with replication to two servers
                  collection.findOneAndUpdate(
                    { str: 'String' },
                    { $set: { f: function () {} } },
                    {
                      returnDocument: ReturnDocument.AFTER,
                      safe: true,
                      serializeFunctions: true,
                      includeResultMetadata: true
                    },
                    function (err, result) {
                      test.ok(result.value.f._bsontype === 'Code');
                      client.close(done);
                    }
                  );
                });
              }
            );
          });
        });
      }
    );

    it(
      'Should Correctly allow for control of serialization of functions on collection level',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var doc = {
          str: 'String',
          func: function () {}
        };
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection(
            'Should_Correctly_allow_for_control_of_serialization_of_functions_on_collection_level',
            { serializeFunctions: true }
          );
          collection.insert(doc, configuration.writeConcernMax(), function (err, result) {
            expect(err).to.not.exist;
            test.ok(result);
            collection.findOne({ str: 'String' }, function (err, item) {
              test.ok(item.func._bsontype === 'Code');
              client.close(done);
            });
          });
        });
      }
    );

    it(
      'Should Correctly allow for using a Date object as _id',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var doc = {
          _id: new Date(),
          str: 'hello'
        };
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('Should_Correctly_allow_for_using_a_Date_object_as__id');
          collection.insert(doc, configuration.writeConcernMax(), function (err, result) {
            expect(err).to.not.exist;
            test.ok(result);
            collection.findOne({ str: 'hello' }, function (err, item) {
              test.ok(item._id instanceof Date);
              client.close(done);
            });
          });
        });
      }
    );

    it(
      'Should Correctly fail to update returning 0 results',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('Should_Correctly_fail_to_update_returning_0_results');
          collection.updateMany(
            { a: 1 },
            { $set: { a: 1 } },
            configuration.writeConcernMax(),
            function (err, r) {
              expect(r).property('matchedCount').to.equal(0);
              client.close(done);
            }
          );
        });
      }
    );

    it(
      'Should Correctly update two fields including a sub field',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var doc = {
          _id: new ObjectId(),
          Prop1: 'p1',
          Prop2: 'p2',
          More: {
            Sub1: 's1',
            Sub2: 's2',
            Sub3: 's3'
          }
        };
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection(
            'Should_Correctly_update_two_fields_including_a_sub_field'
          );
          collection.insert(doc, configuration.writeConcernMax(), function (err, result) {
            expect(err).to.not.exist;
            test.ok(result);
            // Update two fields
            collection.update(
              { _id: doc._id },
              { $set: { Prop1: 'p1_2', 'More.Sub2': 's2_2' } },
              configuration.writeConcernMax(),
              function (err, r) {
                expect(err).to.not.exist;
                expect(r).property('matchedCount').to.equal(1);
                collection.findOne({ _id: doc._id }, function (err, item) {
                  expect(err).to.not.exist;
                  test.equal('p1_2', item.Prop1);
                  test.equal('s2_2', item.More.Sub2);
                  client.close(done);
                });
              }
            );
          });
        });
      }
    );

    it(
      'Should correctly fail due to duplicate key for _id',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection(
            'Should_Correctly_update_two_fields_including_a_sub_field_2'
          );
          collection.insertOne({ _id: 1 }, configuration.writeConcernMax(), function (err, result) {
            expect(err).to.not.exist;
            test.ok(result);
            // Update two fields
            collection.insertOne({ _id: 1 }, configuration.writeConcernMax(), function (err, r) {
              expect(err).to.exist;
              expect(r).to.not.exist;
              client.close(done);
            });
          });
        });
      }
    );

    it(
      'shouldCorrectlyInsertDocWithCustomId',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('shouldCorrectlyInsertDocWithCustomId');
          // Insert the update
          collection.insert(
            { _id: 0, test: 'hello' },
            configuration.writeConcernMax(),
            function (err, result) {
              expect(err).to.not.exist;
              test.ok(result);
              collection.findOne({ _id: 0 }, function (err, item) {
                test.equal(0, item._id);
                test.equal('hello', item.test);
                client.close(done);
              });
            }
          );
        });
      }
    );

    it(
      'shouldCorrectlyPerformUpsertAgainstNewDocumentAndExistingOne',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection(
            'shouldCorrectlyPerformUpsertAgainstNewDocumentAndExistingOne'
          );
          // Upsert a new doc
          collection.update(
            { a: 1 },
            { $set: { a: 1 } },
            { upsert: true, writeConcern: { w: 1 } },
            function (err, result) {
              expect(err).to.not.exist;
              expect(result).property('upsertedCount').to.equal(1);
              // Upsert an existing doc
              collection.update(
                { a: 1 },
                { $set: { a: 1 } },
                { upsert: true, writeConcern: { w: 1 } },
                function (err, result) {
                  expect(err).to.not.exist;
                  expect(result).property('matchedCount').to.equal(1);
                  client.close(done);
                }
              );
            }
          );
        });
      }
    );

    it(
      'shouldCorrectlyPerformLargeTextInsert',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('shouldCorrectlyPerformLargeTextInsert');
          // Create large string, insert and then retrive
          var string = '';
          // Create large text field
          for (var i = 0; i < 50000; i++) {
            string = string + 'a';
          }
          collection.insert(
            { a: 1, string: string },
            configuration.writeConcernMax(),
            function (err, result) {
              expect(err).to.not.exist;
              test.ok(result);
              collection.findOne({ a: 1 }, function (err, doc) {
                expect(err).to.not.exist;
                test.equal(50000, doc.string.length);
                client.close(done);
              });
            }
          );
        });
      }
    );

    it(
      'shouldCorrectlyPerformInsertOfObjectsUsingToBSON',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('shouldCorrectlyPerformInsertOfObjectsUsingToBSON');
          // Create document with toBSON method
          var doc = { a: 1, b: 1 };
          doc.toBSON = function () {
            return { c: this.a };
          };
          collection.insert(doc, configuration.writeConcernMax(), function (err, result) {
            expect(err).to.not.exist;
            test.ok(result);
            collection.findOne({ c: 1 }, function (err, doc) {
              expect(err).to.not.exist;
              test.deepEqual(1, doc.c);
              client.close(done);
            });
          });
        });
      }
    );

    it(
      'shouldAttempToForceBsonSize',
      {
        requires: { topology: 'single' }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          db.createCollection('shouldAttempToForceBsonSize', function (err, collection) {
            // var doc = {a:1, b:new Binary(Buffer.alloc(16777216)/5)}
            var doc = [
              { a: 1, b: new Binary(Buffer.alloc(16777216 / 3)) },
              { a: 1, b: new Binary(Buffer.alloc(16777216 / 3)) },
              { a: 1, b: new Binary(Buffer.alloc(16777216 / 3)) }
            ];
            collection.insert(doc, configuration.writeConcernMax(), function (err, result) {
              expect(err).to.not.exist;
              test.ok(result);
              collection.findOne({ a: 1 }, function (err, doc) {
                expect(err).to.not.exist;
                test.deepEqual(1, doc.a);
                client.close(done);
              });
            });
          });
        });
      }
    );

    it(
      'shouldCorrectlyUseCustomObjectToUpdateDocument',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('shouldCorrectlyUseCustomObjectToUpdateDocument');
          collection.insert(
            { a: { b: { c: 1 } } },
            configuration.writeConcernMax(),
            function (err, result) {
              expect(err).to.not.exist;
              test.ok(result);
              // Dynamically build query
              var query = {};
              query['a'] = {};
              query.a['b'] = {};
              query.a.b['c'] = 1;
              // Update document
              collection.update(
                query,
                { $set: { 'a.b.d': 1 } },
                configuration.writeConcernMax(),
                function (err, r) {
                  expect(err).to.not.exist;
                  expect(r).property('matchedCount').to.equal(1);
                  client.close(done);
                }
              );
            }
          );
        });
      }
    );

    it(
      'shouldExecuteInsertWithNoCallbackAndWriteConcern',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('shouldExecuteInsertWithNoCallbackAndWriteConcern');
          collection.insert({ a: { b: { c: 1 } } }).then(
            () => {
              client.close(done);
            },
            err => {
              client.close(err2 => done(err || err2));
            }
          );
        });
      }
    );

    it(
      'executesCallbackOnceWithOveriddenDefaultDbWriteConcern',
      {
        requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        function cb(err) {
          expect(err).to.not.exist;
          client.close(done);
        }
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('gh-completely2');
          collection.insert({ a: 1 }, { writeConcern: { w: 0 } }, cb);
        });
      }
    );

    it(
      'executesCallbackOnceWithOveriddenDefaultDbWriteConcernWithUpdate',
      {
        requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        function cb(err) {
          expect(err).to.not.exist;
          client.close(done);
        }
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('gh-completely3');
          collection.update(
            { a: 1 },
            { $set: { a: 2 } },
            { upsert: true, writeConcern: { w: 0 } },
            cb
          );
        });
      }
    );

    it(
      'executesCallbackOnceWithOveriddenDefaultDbWriteConcernWithRemove',
      {
        requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        function cb(err) {
          expect(err).to.not.exist;
          client.close(done);
        }
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('gh-completely1');
          collection.deleteMany({ a: 1 }, { writeConcern: { w: 0 } }, cb);
        });
      }
    );

    it(
      'handleBSONTypeInsertsCorrectly',
      {
        requires: {
          topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'],
          mongodb: '<2.8.0'
        }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('bson_types_insert');
          var document = {
            symbol: new BSONSymbol('abcdefghijkl'),
            objid: new ObjectId('abcdefghijkl'),
            double: new Double(1),
            binary: new Binary(Buffer.from('hello world')),
            minkey: new MinKey(),
            maxkey: new MaxKey(),
            code: new Code('function () {}', { a: 55 })
          };
          collection.insert(document, configuration.writeConcernMax(), function (err, result) {
            expect(err).to.not.exist;
            test.ok(result);
            collection.findOne({ symbol: new BSONSymbol('abcdefghijkl') }, function (err, doc) {
              expect(err).to.not.exist;
              test.equal('abcdefghijkl', doc.symbol.toString());
              collection.findOne({ objid: new ObjectId('abcdefghijkl') }, function (err, doc) {
                expect(err).to.not.exist;
                test.equal('6162636465666768696a6b6c', doc.objid.toString());
                collection.findOne({ double: new Double(1) }, function (err, doc) {
                  expect(err).to.not.exist;
                  test.equal(1, doc.double);
                  collection.findOne(
                    { binary: new Binary(Buffer.from('hello world')) },
                    function (err, doc) {
                      expect(err).to.not.exist;
                      test.equal('hello world', doc.binary.toString());
                      collection.findOne({ minkey: new MinKey() }, function (err, doc) {
                        expect(err).to.not.exist;
                        test.ok(doc.minkey._bsontype === 'MinKey');
                        collection.findOne({ maxkey: new MaxKey() }, function (err, doc) {
                          expect(err).to.not.exist;
                          test.ok(doc.maxkey._bsontype === 'MaxKey');
                          collection.findOne(
                            { code: new Code('function () {}', { a: 55 }) },
                            function (err, doc) {
                              expect(err).to.not.exist;
                              test.ok(doc != null);
                              client.close(done);
                            }
                          );
                        });
                      });
                    }
                  );
                });
              });
            });
          });
        });
      }
    );

    it(
      'handleBSONTypeInsertsCorrectlyFor28OrHigher',
      {
        requires: {
          mongodb: '>=2.8.0'
        }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        var document = {
          string: 'abcdefghijkl',
          objid: new ObjectId(Buffer.alloc(12, 1)),
          double: new Double(1),
          binary: new Binary(Buffer.from('hello world')),
          minkey: new MinKey(),
          maxkey: new MaxKey(),
          code: new Code('function () {}', { a: 55 })
        };
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('bson_types_insert_1');
          collection.insert(document, configuration.writeConcernMax(), function (err, result) {
            expect(err).to.not.exist;
            test.ok(result);
            collection.findOne({ string: 'abcdefghijkl' }, function (err, doc) {
              expect(err).to.not.exist;
              test.equal('abcdefghijkl', doc.string.toString());
              collection.findOne({ objid: new ObjectId(Buffer.alloc(12, 1)) }, function (err, doc) {
                expect(err).to.not.exist;
                test.equal('01'.repeat(12), doc.objid.toString());
                collection.findOne({ double: new Double(1) }, function (err, doc) {
                  expect(err).to.not.exist;
                  test.equal(1, doc.double);
                  collection.findOne(
                    { binary: new Binary(Buffer.from('hello world')) },
                    function (err, doc) {
                      expect(err).to.not.exist;
                      test.equal('hello world', doc.binary.toString());
                      collection.findOne({ minkey: new MinKey() }, function (err, doc) {
                        expect(err).to.not.exist;
                        test.ok(doc.minkey._bsontype === 'MinKey');
                        collection.findOne({ maxkey: new MaxKey() }, function (err, doc) {
                          expect(err).to.not.exist;
                          test.ok(doc.maxkey._bsontype === 'MaxKey');
                          collection.findOne(
                            { code: new Code('function () {}', { a: 55 }) },
                            function (err, doc) {
                              expect(err).to.not.exist;
                              test.ok(doc != null);
                              client.close(done);
                            }
                          );
                        });
                      });
                    }
                  );
                });
              });
            });
          });
        });
      }
    );

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

    it(
      'positiveAndNegativeInfinity',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('negative_pos');
          var document = {
            pos: Number.POSITIVE_INFINITY,
            neg: Number.NEGATIVE_INFINITY
          };
          collection.insert(document, configuration.writeConcernMax(), function (err, result) {
            expect(err).to.not.exist;
            test.ok(result);
            collection.findOne({}, function (err, doc) {
              expect(err).to.not.exist;
              test.equal(Number.POSITIVE_INFINITY, doc.pos);
              test.equal(Number.NEGATIVE_INFINITY, doc.neg);
              client.close(done);
            });
          });
        });
      }
    );

    it(
      'shouldCorrectlyInsertSimpleRegExpDocument',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var regexp = /foobar/i;
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          db.createCollection('test_regex', function (err, collection) {
            collection.insert({ b: regexp }, configuration.writeConcernMax(), function (err, ids) {
              expect(err).to.not.exist;
              test.ok(ids);
              collection
                .find({})
                .project({ b: 1 })
                .toArray(function (err, items) {
                  test.equal('' + regexp, '' + items[0].b);
                  // Let's close the db
                  client.close(done);
                });
            });
          });
        });
      }
    );

    it(
      'shouldCorrectlyInsertSimpleUTF8Regexp',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var regexp = /foobaré/;
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var collection = db.collection('shouldCorrectlyInsertSimpleUTF8Regexp');
          collection.insert({ b: regexp }, configuration.writeConcernMax(), function (err, ids) {
            expect(err).to.not.exist;
            test.ok(ids);
            collection
              .find({})
              .project({ b: 1 })
              .toArray(function (err, items) {
                expect(err).to.not.exist;
                test.equal('' + regexp, '' + items[0].b);
                // Let's close the db
                client.close(done);
              });
          });
        });
      }
    );

    it(
      'shouldCorrectlyThrowDueToIllegalCollectionName',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var k = Buffer.alloc(15);
          for (var i = 0; i < 15; i++) k[i] = 0;
          k.write('hello');
          k[6] = 0x06;
          k.write('world', 10);
          try {
            db.collection(k.toString());
            test.fail(false);
          } catch (err) {} // eslint-disable-line
          client.close(done);
        });
      }
    );

    it(
      'shouldCorrectlyHonorPromoteLongFalseNativeBSON',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      async function () {
        const configuration = this.configuration;
        const o = configuration.writeConcernMax();
        o.promoteLongs = false;
        const client = configuration.newClient(configuration.writeConcernMax(), {
          maxPoolSize: 1,
          promoteLongs: false
        });
        await client.connect();
        const db = client.db(configuration.db);
        await db.collection('shouldCorrectlyHonorPromoteLong').insertOne({
          doc: Long.fromNumber(10),
          array: [[Long.fromNumber(10)]]
        });
        const doc = await db.collection('shouldCorrectlyHonorPromoteLong').findOne();
        expect(doc.doc._bsontype === 'Long');
        expect(doc.array[0][0]._bsontype === 'Long');
        await client.close();
      }
    );

    it(
      'shouldCorrectlyHonorPromoteLongFalseNativeBSONWithGetMore',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      async function () {
        const configuration = this.configuration;
        const o = configuration.writeConcernMax();
        o.promoteLongs = false;
        const client = configuration.newClient(configuration.writeConcernMax(), {
          maxPoolSize: 1,
          promoteLongs: false
        });
        await client.connect();
        const db = client.db(configuration.db);
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
        client.close();
      }
    );

    it(
      'shouldCorrectlyInheritPromoteLongFalseNativeBSONWithGetMore',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      async function () {
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
      }
    );

    it(
      'shouldCorrectlyHonorPromoteLongTrueNativeBSON',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          db.collection('shouldCorrectlyHonorPromoteLongTrueNativeBSON').insert(
            {
              doc: Long.fromNumber(10),
              array: [[Long.fromNumber(10)]]
            },
            function (err, doc) {
              expect(err).to.not.exist;
              test.ok(doc);
              db.collection('shouldCorrectlyHonorPromoteLongTrueNativeBSON').findOne(function (
                err,
                doc
              ) {
                expect(err).to.not.exist;
                expect(err).to.not.exist;
                test.ok('number', typeof doc.doc);
                test.ok('number', typeof doc.array[0][0]);
                client.close(done);
              });
            }
          );
        });
      }
    );

    it(
      'shouldCorrectlyHonorPromoteLongFalseJSBSON',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      async function () {
        const configuration = this.configuration;
        const client = configuration.newClient(configuration.writeConcernMax(), {
          maxPoolSize: 1,
          promoteLongs: false
        });
        await client.connect();
        const db = client.db(configuration.db);
        await db.collection('shouldCorrectlyHonorPromoteLongFalseJSBSON').insertOne({
          doc: Long.fromNumber(10),
          array: [[Long.fromNumber(10)]]
        });
        const doc = await db.collection('shouldCorrectlyHonorPromoteLongFalseJSBSON').findOne({});
        expect(doc.doc._bsontype).to.equal('Long');
        expect(doc.array[0][0]._bsontype).to.equal('Long');
        await client.close();
      }
    );

    it(
      'shouldCorrectlyHonorPromoteLongTrueJSBSON',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          db.collection('shouldCorrectlyHonorPromoteLongTrueJSBSON').insert(
            {
              doc: Long.fromNumber(10),
              array: [[Long.fromNumber(10)]]
            },
            function (err, doc) {
              expect(err).to.not.exist;
              test.ok(doc);
              db.collection('shouldCorrectlyHonorPromoteLongTrueJSBSON').findOne(function (
                err,
                doc
              ) {
                expect(err).to.not.exist;
                expect(err).to.not.exist;
                test.ok('number', typeof doc.doc);
                test.ok('number', typeof doc.array[0][0]);
                client.close(done);
              });
            }
          );
        });
      }
    );

    it(
      'shouldCorrectlyWorkWithCheckKeys',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          db.collection('shouldCorrectlyOverrideCheckKeysJSOnUpdate').update(
            {
              'ps.op.t': 1
            },
            { $set: { b: 1 } },
            { checkKeys: false },
            function (err, doc) {
              expect(err).to.not.exist;
              test.ok(doc);
              client.close(done);
            }
          );
        });
      }
    );

    it(
      'shouldCorrectlyApplyBitOperator',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var col = db.collection('shouldCorrectlyApplyBitOperator');
          col.insert({ a: 1, b: 1 }, function (err, result) {
            expect(err).to.not.exist;
            test.ok(result);
            col.update({ a: 1 }, { $bit: { b: { and: 0 } } }, function (err, result) {
              expect(err).to.not.exist;
              test.ok(result);
              col.findOne({ a: 1 }, function (err, doc) {
                expect(err).to.not.exist;
                test.equal(1, doc.a);
                test.equal(0, doc.b);
                client.close(done);
              });
            });
          });
        });
      }
    );
    function trim(str) {
      return str.replace(/\n/g, '').replace(/ /g, '');
    }

    it(
      'shouldCorrectlyPerformInsertAndUpdateWithFunctionSerialization',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var col = db.collection(
            'shouldCorrectlyPerformInsertAndUpdateWithFunctionSerialization',
            {
              serializeFunctions: true
            }
          );
          col.insert(
            {
              a: 1,
              f: function (x) {
                return x;
              }
            },
            function (err, doc) {
              expect(err).to.not.exist;
              test.ok(doc);
              col.update(
                { a: 1 },
                {
                  $set: {
                    f: function (y) {
                      return y;
                    }
                  }
                },
                function (err, doc) {
                  expect(err).to.not.exist;
                  test.ok(doc);
                  col.findOne({ a: 1 }, function (err, doc) {
                    expect(err).to.not.exist;
                    test.equal(trim('function (y){return y;}'), trim(doc.f.code));
                    client.close(done);
                  });
                }
              );
            }
          );
        });
      }
    );

    it(
      'should correctly insert > 1000 docs using insert and insertMany',
      {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          var col = db.collection('shouldCorrectlyAllowforMoreThanAThousandDocsInsert', {
            serializeFunctions: true
          });
          var docs = [];
          for (var i = 0; i < 2000; i++) {
            docs.push({ a: i });
          }
          col.insertMany(docs, function (err, result) {
            expect(err).to.not.exist;
            expect(result).property('insertedCount').to.equal(2000);
            docs = [];
            for (var i = 0; i < 2000; i++) {
              docs.push({ a: i });
            }
            col.insertMany(docs, function (err, res) {
              expect(err).to.not.exist;
              expect(res).property('insertedCount').to.equal(2000);
              client.close(done);
            });
          });
        });
      }
    );

    it('should return error on unordered insertMany with multiple unique key constraints', async () => {
      const col = client.db().collection('insertManyMultipleWriteErrors');
      await col.drop().catch(() => null);
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
      await col.drop().catch(() => null);
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

    it(
      'Correctly allow forceServerObjectId for insertOne',
      { requires: { topology: ['single'] } },
      function (done) {
        var started = [];
        var succeeded = [];
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), {
          maxPoolSize: 1,
          monitorCommands: true
        });
        client.on('commandStarted', function (event) {
          if (event.commandName === 'insert') started.push(event);
        });
        client.on('commandSucceeded', function (event) {
          if (event.commandName === 'insert') succeeded.push(event);
        });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          expect(err).to.not.exist;
          db.collection('apm_test')
            .insertOne({ a: 1 }, { forceServerObjectId: true })
            .then(function () {
              expect(started[0].command.documents[0]._id).to.not.exist;
              client.close(done);
            });
        });
      }
    );

    it(
      'Correctly allow forceServerObjectId for insertMany',
      { requires: { topology: ['single'] } },
      function (done) {
        var started = [];
        var succeeded = [];
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), {
          maxPoolSize: 1,
          monitorCommands: true
        });
        client.on('commandStarted', function (event) {
          if (event.commandName === 'insert') started.push(event);
        });
        client.on('commandSucceeded', function (event) {
          if (event.commandName === 'insert') succeeded.push(event);
        });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          expect(err).to.not.exist;
          db.collection('apm_test')
            .insertMany([{ a: 1 }], { forceServerObjectId: true })
            .then(function () {
              expect(started[0].command.documents[0]._id).to.not.exist;
              client.close(done);
            });
        });
      }
    );

    it(
      'should return correct number of ids for insertMany { ordered: true }',
      { requires: { topology: ['single'] } },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          expect(err).to.not.exist;
          db.collection('inserted_ids_test')
            .insertMany([{}, {}, {}], { ordered: true })
            .then(function (r) {
              expect(r).property('insertedCount').to.equal(3);
              client.close(done);
            });
        });
      }
    );

    it(
      'should return correct number of ids for insertMany { ordered: false }',
      { requires: { topology: ['single'] } },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          expect(err).to.not.exist;
          db.collection('inserted_ids_test')
            .insertMany([{}, {}, {}], { ordered: false })
            .then(function (r) {
              expect(err).to.not.exist;
              expect(r).property('insertedCount').to.equal(3);
              client.close(done);
            });
        });
      }
    );

    it(
      'Insert document including sub documents',
      { requires: { topology: ['single'] } },
      function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(configuration.db);
          expect(err).to.not.exist;
          var shipment = {
            shipment1: 'a'
          };
          var supplier = {
            shipments: [shipment]
          };
          var product = {
            suppliers: [supplier]
          };
          var doc = {
            a: 1,
            products: [product]
          };
          db.collection('sub_documents').insertOne(doc, function (err, r) {
            expect(err).to.not.exist;
            test.ok(r);
            db.collection('sub_documents')
              .find({})
              .next(function (err, v) {
                expect(err).to.not.exist;
                test.equal('a', v.products[0].suppliers[0].shipments[0].shipment1);
                client.close(done);
              });
          });
        });
      }
    );

    it('MongoBulkWriteError and BulkWriteResult should respect BulkWrite', function () {
      return client
        .connect()
        .then(() => {
          return client.db().collection('test_insertMany_bulkResult').drop();
        })
        .catch(ignoreNsNotFound)
        .then(() => {
          const collection = client.db().collection('test_insertMany_bulkResult');
          return collection.insertMany(
            [
              { _id: 2, x: 22 },
              { _id: 2, x: 22 },
              { _id: 3, x: 33 }
            ],
            { ordered: false }
          );
        })
        .then(() => {
          expect.fail('InsertMany should fail with multi key error');
        })
        .catch(error => {
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
        })
        .finally(() => client.db().collection('test_insertMany_bulkResult').drop())
        .finally(() => client.close());
    });
  });
});
