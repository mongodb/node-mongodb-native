"use strict";

var Script = require('vm');

/**
 * Module for parsing an ISO 8601 formatted string into a Date object.
 * @ignore
 */
var ISODate = function (string) {
  var match;

  if (typeof string.getTime === "function")
    return string;
  else if (match = string.match(/^(\d{4})(-(\d{2})(-(\d{2})(T(\d{2}):(\d{2})(:(\d{2})(\.(\d+))?)?(Z|((\+|-)(\d{2}):(\d{2}))))?)?)?$/)) {
    var date = new Date();
    date.setUTCFullYear(Number(match[1]));
    date.setUTCMonth(Number(match[3]) - 1 || 0);
    date.setUTCDate(Number(match[5]) || 0);
    date.setUTCHours(Number(match[7]) || 0);
    date.setUTCMinutes(Number(match[8]) || 0);
    date.setUTCSeconds(Number(match[10]) || 0);
    date.setUTCMilliseconds(Number("." + match[12]) * 1000 || 0);

    if (match[13] && match[13] !== "Z") {
      var h = Number(match[16]) || 0,
          m = Number(match[17]) || 0;

      h *= 3600000;
      m *= 60000;

      var offset = h + m;
      if (match[15] == "+")
        offset = -offset;

      new Date(date.valueOf() + offset);
    }

    return date;
  } else
    throw new Error("Invalid ISO 8601 date given.", __filename);
};

/**
 * @ignore
 */
exports.shouldCorrectlyPerformSingleInsert = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldCorrectlyPerformSingleInsert');
      collection.insert({a:1}, configuration.writeConcernMax(), function(err, result) {
        collection.findOne(function(err, item) {
          test.equal(1, item.a);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleMultipleDocumentInsert = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('test_multiple_insert');
      var docs = [{a:1}, {a:2}];

      collection.insert(docs, configuration.writeConcernMax(), function(err, r) {
        r.forEach(function(doc) {
          test.ok(((doc['_id']) instanceof ObjectID || Object.prototype.toString.call(doc['_id']) === '[object ObjectID]'));
        });

        // Let's ensure we have both documents
        collection.find().toArray(function(err, docs) {
          test.equal(2, docs.length);
          var results = [];
          // Check that we have all the results we want
          docs.forEach(function(doc) {
            if(doc.a == 1 || doc.a == 2) results.push(1);
          });
          test.equal(2, results.length);
          // Let's close the db
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyExecuteSaveInsertUpdate = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldCorrectlyExecuteSaveInsertUpdate');

      collection.save({ email : 'save' }, configuration.writeConcernMax(), function() {
        collection.insert({ email : 'insert' }, configuration.writeConcernMax(), function() {
          collection.update(
            { email : 'update' },
            { email : 'update' },
            { upsert: true, w:1},

            function() {
              collection.find().toArray(function(e, a) {
                test.equal(3, a.length)
                db.close();
                test.done();
              });
            }
          );
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertAndRetrieveLargeIntegratedArrayDocument = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('test_should_deserialize_large_integrated_array');

      var doc = {'a':0,
        'b':['tmp1', 'tmp2', 'tmp3', 'tmp4', 'tmp5', 'tmp6', 'tmp7', 'tmp8', 'tmp9', 'tmp10', 'tmp11', 'tmp12', 'tmp13', 'tmp14', 'tmp15', 'tmp16']
      };
      // Insert the collection
      collection.insert(doc, configuration.writeConcernMax(), function(err, r) {
        // Fetch and check the collection
        collection.findOne({'a': 0}, function(err, result) {
          test.deepEqual(doc.a, result.a);
          test.deepEqual(doc.b, result.b);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertAndRetrieveDocumentWithAllTypes = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID
      , Binary = configuration.require.Binary
      , Code = configuration.require.Code
      , DBRef = configuration.require.DBRef;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('test_all_serialization_types');

      var date = new Date();
      var oid = new ObjectID();
      var string = 'binstring'
      var bin = new Binary()
      for(var index = 0; index < string.length; index++) {
        bin.put(string.charAt(index))
      }

      var motherOfAllDocuments = {
        'string': 'hello',
        'array': [1,2,3],
        'hash': {'a':1, 'b':2},
        'date': date,
        'oid': oid,
        'binary': bin,
        'int': 42,
        'float': 33.3333,
        'regexp': /regexp/,
        'boolean': true,
        'long': date.getTime(),
        'where': new Code('this.a > i', {i:1}),
        'dbref': new DBRef('namespace', oid, 'integration_tests_')
      }

      collection.insert(motherOfAllDocuments, configuration.writeConcernMax(), function(err, docs) {
        collection.findOne(function(err, doc) {
          // Assert correct deserialization of the values
          test.equal(motherOfAllDocuments.string, doc.string);
          test.deepEqual(motherOfAllDocuments.array, doc.array);
          test.equal(motherOfAllDocuments.hash.a, doc.hash.a);
          test.equal(motherOfAllDocuments.hash.b, doc.hash.b);
          test.equal(date.getTime(), doc.long);
          test.equal(date.toString(), doc.date.toString());
          test.equal(date.getTime(), doc.date.getTime());
          test.equal(motherOfAllDocuments.oid.toHexString(), doc.oid.toHexString());
          test.equal(motherOfAllDocuments.binary.value(), doc.binary.value());

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
          db.close();
          test.done();
        })
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertAndUpdateDocumentWithNewScriptContext = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('test_all_serialization_types');

      //convience curried handler for functions of type 'a -> (err, result)
      function getResult(callback){
        return function(error, result) {
          test.ok(error == null);
          return callback(result);
        }
      };

      db.collection('users', getResult(function(user_collection){
        user_collection.remove({}, configuration.writeConcernMax(), function(err, result) {
          //first, create a user object
          var newUser = { name : 'Test Account', settings : {} };
          user_collection.insert([newUser], configuration.writeConcernMax(), getResult(function(r){
              var user = r[0];

              var scriptCode = "settings.block = []; settings.block.push('test');";
              var context = { settings : { thisOneWorks : "somestring" } };

              Script.runInNewContext(scriptCode, context, "testScript");

              //now create update command and issue it
              var updateCommand = { $set : context };

              user_collection.update({_id : user._id}, updateCommand, configuration.writeConcernMax(),
                getResult(function(updateCommand) {
                  // Fetch the object and check that the changes are persisted
                  user_collection.findOne({_id : user._id}, function(err, doc) {
                    test.ok(err == null);
                    test.equal("Test Account", doc.name);
                    test.equal("somestring", doc.settings.thisOneWorks);
                    test.equal("test", doc.settings.block[0]);
                    db.close();
                    test.done();
                  });
                })
              );
          }));
        });
      }));
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlySerializeDocumentWithAllTypesInNewContext = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID
      , Binary = configuration.require.Binary
      , Code = configuration.require.Code
      , DBRef = configuration.require.DBRef;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('test_all_serialization_types_new_context');

      var date = new Date();
      var scriptCode =
        "var string = 'binstring'\n" +
        "var bin = new mongo.Binary()\n" +
        "for(var index = 0; index < string.length; index++) {\n" +
        "  bin.put(string.charAt(index))\n" +
        "}\n" +
        "motherOfAllDocuments['string'] = 'hello';" +
        "motherOfAllDocuments['array'] = [1,2,3];" +
        "motherOfAllDocuments['hash'] = {'a':1, 'b':2};" +
        "motherOfAllDocuments['date'] = date;" +
        "motherOfAllDocuments['oid'] = new mongo.ObjectID();" +
        "motherOfAllDocuments['binary'] = bin;" +
        "motherOfAllDocuments['int'] = 42;" +
        "motherOfAllDocuments['float'] = 33.3333;" +
        "motherOfAllDocuments['regexp'] = /regexp/;" +
        "motherOfAllDocuments['boolean'] = true;" +
        "motherOfAllDocuments['long'] = motherOfAllDocuments['date'].getTime();" +
        "motherOfAllDocuments['where'] = new mongo.Code('this.a > i', {i:1});" +
        "motherOfAllDocuments['dbref'] = new mongo.DBRef('namespace', motherOfAllDocuments['oid'], 'integration_tests_');";

      var context = {
        motherOfAllDocuments : {},
        mongo:{
          ObjectID:ObjectID,
          Binary:Binary,
          Code:Code,
          DBRef:DBRef
        },
        date:date};

      // Execute function in context
      Script.runInNewContext(scriptCode, context, "testScript");
      // sys.puts(sys.inspect(context.motherOfAllDocuments))
      var motherOfAllDocuments = context.motherOfAllDocuments;

      collection.insert(context.motherOfAllDocuments, configuration.writeConcernMax(), function(err, docs) {
        collection.findOne(function(err, doc) {
          // Assert correct deserialization of the values
          test.equal(motherOfAllDocuments.string, doc.string);
          test.deepEqual(motherOfAllDocuments.array, doc.array);
          test.equal(motherOfAllDocuments.hash.a, doc.hash.a);
          test.equal(motherOfAllDocuments.hash.b, doc.hash.b);
          test.equal(date.getTime(), doc.long);
          test.equal(date.toString(), doc.date.toString());
          test.equal(date.getTime(), doc.date.getTime());
          test.equal(motherOfAllDocuments.oid.toHexString(), doc.oid.toHexString());
          test.equal(motherOfAllDocuments.binary.value(), doc.binary.value());

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
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyDoToJsonForLongValue = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('test_to_json_for_long');

      collection.insert([{value: Long.fromNumber(32222432)}], configuration.writeConcernMax(), function(err, ids) {
        collection.findOne({}, function(err, item) {
          test.equal(32222432, item.value);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertAndUpdateWithNoCallback = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('test_insert_and_update_no_callback');

      // Insert the update
      collection.insert({i:1}, function() {})
      // Update the record
      collection.update({i:1}, {"$set":{i:2}}, function() {})

      // Make sure we leave enough time for mongodb to record the data
      setTimeout(function() {
        // Locate document
        collection.findOne({}, function(err, item) {
          test.equal(2, item.i)
          db.close();
          test.done();
        });
      }, 100);
    });
  }
}

/**
 * @ignore
 */
exports.shouldInsertAndQueryTimestamp = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Timestamp = configuration.require.Timestamp
      , Long = configuration.require.Long;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('test_insert_and_query_timestamp');

      // Insert the update
      collection.insert({i:Timestamp.fromNumber(100), j:Long.fromNumber(200)}, configuration.writeConcernMax(), function(err, r) {
        // Locate document
        collection.findOne({}, function(err, item) {
          test.ok(item.i instanceof Timestamp);
          test.equal(100, item.i);
          test.equal(200, item.j);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertAndQueryUndefined = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('test_insert_and_query_undefined');

      // Insert the update
      collection.insert({i:undefined}, configuration.writeConcernMax(), function(err, r) {
        // Locate document
        collection.findOne({}, function(err, item) {
          test.equal(null, item.i)

          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlySerializeDBRefToJSON = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var DBRef = configuration.require.DBRef
      , ObjectID = configuration.require.ObjectID;

    var dbref = new DBRef("foo", ObjectID.createFromHexString("fc24a04d4560531f00000000"), null);
    JSON.stringify(dbref);
    test.done();
  }
}

/**
 * @ignore
 */
exports.shouldThrowErrorIfSerializingFunction = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('test_should_throw_error_if_serializing_function');

      var func = function() { return 1};
      // Insert the update
      collection.insert({i:1, z:func }, {w:1, serializeFunctions:true}, function(err, result) {
        test.equal(null, err);

        collection.findOne({_id:result[0]._id}, function(err, object) {
          test.equal(func.toString(), object.z.code);
          test.equal(1, object.i);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertDocumentWithUUID = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Binary = configuration.require.Binary;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('insert_doc_with_uuid');

      collection.insert({_id : "12345678123456781234567812345678", field: '1'}, configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        collection.find({_id : "12345678123456781234567812345678"}).toArray(function(err, items) {
          test.equal(null, err);
          test.equal(items[0]._id, "12345678123456781234567812345678")
          test.equal(items[0].field, '1')

          // Generate a binary id
          var binaryUUID = new Binary('00000078123456781234567812345678', Binary.SUBTYPE_UUID);

          collection.insert({_id : binaryUUID, field: '2'}, configuration.writeConcernMax(), function(err, result) {
            collection.find({_id : binaryUUID}).toArray(function(err, items) {
              test.equal(null, err);
              test.equal(items[0].field, '2')
              db.close();
              test.done();
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyCallCallbackWithDbDriverInStrictMode = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('test_insert_and_update_no_callback_strict');

      collection.insert({_id : "12345678123456781234567812345678", field: '1'}, configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        collection.update({ '_id': "12345678123456781234567812345678" }, { '$set': { 'field': 0 }}, configuration.writeConcernMax(), function(err, r) {
          test.equal(null, err);
          test.equal(1, r);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertDBRefWithDbNotDefined = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var DBRef = configuration.require.DBRef
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldCorrectlyInsertDBRefWithDbNotDefined');

      var doc = {_id: new ObjectID()};
      var doc2 = {_id: new ObjectID()};
      var doc3 = {_id: new ObjectID()};
      
      collection.insert(doc, configuration.writeConcernMax(), function(err, result) {
        // Create object with dbref
        doc2.ref = new DBRef('shouldCorrectlyInsertDBRefWithDbNotDefined', doc._id);
        doc3.ref = new DBRef('shouldCorrectlyInsertDBRefWithDbNotDefined', doc._id, configuration.db_name);

        collection.insert([doc2, doc3], configuration.writeConcernMax(), function(err, result) {
          
          // Get all items
          collection.find().toArray(function(err, items) {
            test.equal("shouldCorrectlyInsertDBRefWithDbNotDefined", items[1].ref.namespace);
            test.equal(doc._id.toString(), items[1].ref.oid.toString());
            test.equal(null, items[1].ref.db);

            test.equal("shouldCorrectlyInsertDBRefWithDbNotDefined", items[2].ref.namespace);
            test.equal(doc._id.toString(), items[2].ref.oid.toString());
            test.equal(configuration.db_name, items[2].ref.db);

            db.close();
            test.done();
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertUpdateRemoveWithNoOptions = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldCorrectlyInsertUpdateRemoveWithNoOptions');

      collection.insert({a:1}, configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        collection.update({a:1}, {a:2}, configuration.writeConcernMax(), function(err, result) {
          test.equal(null, err);

          collection.remove({a:2}, configuration.writeConcernMax(), function(err, result) {
            test.equal(null, err);

            collection.count(function(err, count) {
              test.equal(0, count);
              db.close();
              test.done();
            })
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyExecuteMultipleFetches = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    // Search parameter
    var to = 'ralph'
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldCorrectlyExecuteMultipleFetches');
      // Execute query
      collection.insert({addresses:{localPart:'ralph'}}, configuration.writeConcernMax(), function(err, result) {
        // Let's find our user
        collection.findOne({"addresses.localPart" : to}, function( err, doc ) {
          test.equal(null, err);
          test.equal(to, doc.addresses.localPart);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyFailWhenNoObjectToUpdate = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldCorrectlyFailWhenNoObjectToUpdate');

      collection.update({_id : new ObjectID()}, { email : 'update' }, configuration.writeConcernMax(),
        function(err, result) {
          test.equal(0, result);
          db.close();
          test.done();
        }
      );
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly insert object and retrieve it when containing array and IsoDate'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;

    var doc = {
     "_id" : new ObjectID("4e886e687ff7ef5e00000162"),
     "str" : "foreign",
     "type" : 2,
     "timestamp" : ISODate("2011-10-02T14:00:08.383Z"),
     "links" : [
       "http://www.reddit.com/r/worldnews/comments/kybm0/uk_home_secretary_calls_for_the_scrapping_of_the/"
     ]
    }

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('Should_correctly_insert_object_and_retrieve_it_when_containing_array_and_IsoDate');

      collection.insert(doc, configuration.writeConcernMax(), function(err, result) {
        test.ok(err == null);

        collection.findOne(function(err, item) {
          test.ok(err == null);
          test.deepEqual(doc, item);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly insert object with timestamps'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID
      , Timestamp = configuration.require.Timestamp;

    var doc = {
     "_id" : new ObjectID("4e886e687ff7ef5e00000162"),
     "str" : "foreign",
     "type" : 2,
     "timestamp" : new Timestamp(10000),
     "links" : [
       "http://www.reddit.com/r/worldnews/comments/kybm0/uk_home_secretary_calls_for_the_scrapping_of_the/"
     ],
     "timestamp2" : new Timestamp(33333),
    }

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('Should_correctly_insert_object_with_timestamps');

      collection.insert(doc, configuration.writeConcernMax(), function(err, result) {
        test.ok(err == null);

        collection.findOne(function(err, item) {
          test.ok(err == null);
          test.deepEqual(doc, item);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should fail on insert due to key starting with $'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;

    var doc = {
     "_id" : new ObjectID("4e886e687ff7ef5e00000162"),
     "$key" : "foreign",
    }

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('Should_fail_on_insert_due_to_key_starting_with');
      collection.insert(doc, configuration.writeConcernMax(), function(err, result) {
        test.ok(err != null);
        db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should Correctly allow for control of serialization of functions on command level'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Code = configuration.require.Code;

    var doc = {
      str : "String",
      func : function() {}
    }

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('Should_Correctly_allow_for_control_of_serialization_of_functions_on_command_level');
      collection.insert(doc, {w:1}, function(err, result) {

        collection.update({str:"String"}, {$set:{c:1, d:function(){}}}, {w:1, serializeFunctions:false}, function(err, result) {
          test.equal(1, result);

          collection.findOne({str:"String"}, function(err, item) {
            test.equal(null, item.d);

            // Execute a safe insert with replication to two servers
            collection.findAndModify({str:"String"}, [['a', 1]], {'$set':{'f':function() {}}}, {new:true, safe: true, serializeFunctions:true}, function(err, result) {
              test.ok(result.f instanceof Code)
              db.close();
              test.done();
            })
          })
        })
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should Correctly allow for control of serialization of functions on collection level'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Code = configuration.require.Code;

    var doc = {
      str : "String",
      func : function() {}
    }

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('Should_Correctly_allow_for_control_of_serialization_of_functions_on_collection_level', {serializeFunctions:true});
      collection.insert(doc, configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        collection.findOne({str : "String"}, function(err, item) {
          test.ok(item.func instanceof Code);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should Correctly allow for using a Date object as _id'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var doc = {
      _id : new Date(),
      str : 'hello'
    }

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('Should_Correctly_allow_for_using_a_Date_object_as__id');
      collection.insert(doc, configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        collection.findOne({str : "hello"}, function(err, item) {
          test.ok(item._id instanceof Date);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should Correctly fail to update returning 0 results'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('Should_Correctly_fail_to_update_returning_0_results');
      collection.update({a:1}, {$set: {a:1}}, configuration.writeConcernMax(), function(err, r) {
        test.equal(0, r);
        db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should Correctly update two fields including a sub field'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;

    var doc = {
      _id: new ObjectID(),
      Prop1: 'p1',
      Prop2: 'p2',
      More: {
        Sub1: 's1',
        Sub2: 's2',
        Sub3: 's3'
      }
    }

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('Should_Correctly_update_two_fields_including_a_sub_field');
      collection.insert(doc, configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        // Update two fields
        collection.update({_id:doc._id}, {$set:{Prop1:'p1_2', 'More.Sub2':'s2_2'}}, configuration.writeConcernMax(), function(err, r) {
          test.equal(null, err);
          test.equal(1, r);

          collection.findOne({_id:doc._id}, function(err, item) {
            test.equal(null, err);
            test.equal('p1_2', item.Prop1);
            test.equal('s2_2', item.More.Sub2);
            db.close();
            test.done();
          })
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly fail due to duplicate key for _id'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('Should_Correctly_update_two_fields_including_a_sub_field_2');
      collection.insert({_id:1}, configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        // Update two fields
        collection.insert({_id:1}, configuration.writeConcernMax(), function(err, result) {
          test.ok(err != null);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertDocWithCustomId = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldCorrectlyInsertDocWithCustomId');
      // Insert the update
      collection.insert({_id:0, test:'hello'}, configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        collection.findOne({_id:0}, function(err, item) {
          test.equal(0, item._id);
          test.equal('hello', item.test);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformUpsertAgainstNewDocumentAndExistingOne = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldCorrectlyPerformUpsertAgainstNewDocumentAndExistingOne');

      // Upsert a new doc
      collection.update({a:1}, {a:1}, {upsert:true, w:1}, function(err, result, status) {
        test.equal(1, result);
        test.equal(false, status.updatedExisting);
        test.equal(1, status.n);
        test.ok(status.upserted != null);

        // Upsert an existing doc
        collection.update({a:1}, {a:1}, {upsert:true, w:1}, function(err, result, status) {
          test.equal(1, result);
          test.equal(true, status.updatedExisting);
          test.equal(1, status.n);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformLargeTextInsert = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldCorrectlyPerformLargeTextInsert');

      // Create large string, insert and then retrive
      var string = "";
      // Create large text field
      for(var i = 0; i < 50000; i++) {
        string = string + "a";
      }

      collection.insert({a:1, string:string}, configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        collection.findOne({a:1}, function(err, doc) {
          test.equal(null, err);
          test.equal(50000, doc.string.length);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformInsertOfObjectsUsingToBSON = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldCorrectlyPerformInsertOfObjectsUsingToBSON');

      // Create document with toBSON method
      var doc = {a:1, b:1};
      doc.toBSON = function() { return {c:this.a}};

      collection.insert(doc, configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        collection.findOne({c:1}, function(err, doc) {
          test.equal(null, err);
          test.deepEqual(1, doc.c);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldAttempToForceBsonSize = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: {
    requires: {topology: 'single', mongodb: '>=2.4.x'}
  },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Binary = configuration.require.Binary;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, disableDriverBSONSizeCheck:true});
    // Establish connection to db
    db.open(function(err, db) {
      db.createCollection('shouldAttempToForceBsonSize', function(err, collection) {
        // var doc = {a:1, b:new Binary(new Buffer(16777216)/5)}
        var doc = [
          {a:1, b:new Binary(new Buffer(16777216/3))},
          {a:1, b:new Binary(new Buffer(16777216/3))},
          {a:1, b:new Binary(new Buffer(16777216/3))},
        ]

        collection.insert(doc, configuration.writeConcernMax(), function(err, result) {
          test.equal(null, err);

          collection.findOne({a:1}, function(err, doc) {
            test.equal(null, err);
            test.deepEqual(1, doc.a);

            db.close();
            test.done();
          });
        });
      });
    })
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyUseCustomObjectToUpdateDocument = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldCorrectlyUseCustomObjectToUpdateDocument');

      collection.insert({a:{b:{c:1}}}, configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        // Dynamically build query
        var query = {};
        query['a'] = {};
        query.a['b'] = {};
        query.a.b['c'] = 1;

        // Update document
        collection.update(query, {$set: {'a.b.d':1}}, configuration.writeConcernMax(), function(err, r) {
          test.equal(null, err);
          test.equal(1, r);

          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldExecuteInsertWithNoCallbackAndWriteConcern = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldExecuteInsertWithNoCallbackAndWriteConcern');
      collection.insert({a:{b:{c:1}}}, function(){});
      db.close();
      test.done();
    });
  }
}

/**
 * @ignore
 */
exports.executesCallbackOnceWithOveriddenDefaultDbWriteConcern = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    function cb (err) {
      cb.called++;
      test.equal(1, cb.called);
    }
    cb.called = 0;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('gh-completely');
      collection.insert({ a: 1 }, { w: 0 }, cb);
      
      setTimeout(function(){
        db.close();
        test.done();
      }, 100)
    });
  }
}

/**
 * @ignore
 */
exports.executesCallbackOnceWithOveriddenDefaultDbWriteConcernWithUpdate = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    function cb (err) {
      test.equal(null, err);
      cb.called++;
      test.equal(1, cb.called);
    }
    cb.called = 0;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('gh-completely');
      collection.update({ a: 1 }, {a:2}, { upsert:true, w: 0 }, cb);
      
      setTimeout(function(){
        db.close();
        test.done();
      }, 100)
    });
  }
}

/**
 * @ignore
 */
exports.executesCallbackOnceWithOveriddenDefaultDbWriteConcernWithRemove = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    function cb (err) {
      test.equal(null, err);
      cb.called++;
      test.equal(1, cb.called);
    }
    cb.called = 0;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('gh-completely');
      collection.remove({ a: 1 }, { w: 0 }, cb);
      
      setTimeout(function(){
        db.close();
        test.done();
      }, 100);
    });
  }
}

/**
 * @ignore
 */
exports.handleBSONTypeInsertsCorrectly = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'], mongodb: "<2.8.0" } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID
      , Symbol = configuration.require.Symbol
      , Double = configuration.require.Double
      , Binary = configuration.require.Binary
      , MinKey = configuration.require.MinKey
      , MaxKey = configuration.require.MaxKey
      , Code = configuration.require.Code;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('bson_types_insert');

      var document = {
          "symbol": new Symbol("abcdefghijkl")
        , "objid": new ObjectID("abcdefghijkl")
        , "double": new Double(1)
        , "binary": new Binary(new Buffer("hello world"))
        , "minkey": new MinKey()
        , "maxkey": new MaxKey()
        , "code": new Code("function () {}", {a: 55})
      }

      collection.insert(document, configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        collection.findOne({"symbol": new Symbol("abcdefghijkl")}, function(err, doc) {
          test.equal(null, err);
          test.equal("abcdefghijkl", doc.symbol.toString());

          collection.findOne({"objid": new ObjectID("abcdefghijkl")}, function(err, doc) {            
            test.equal(null, err);
            test.equal("6162636465666768696a6b6c", doc.objid.toString());

            collection.findOne({"double": new Double(1)}, function(err, doc) {            
              test.equal(null, err);
              test.equal(1, doc.double);

              collection.findOne({"binary": new Binary(new Buffer("hello world"))}, function(err, doc) {            
                test.equal(null, err);
                test.equal("hello world", doc.binary.toString());

                collection.findOne({"minkey": new MinKey()}, function(err, doc) {            
                  test.equal(null, err);
                  test.ok(doc.minkey instanceof MinKey);

                  collection.findOne({"maxkey": new MaxKey()}, function(err, doc) {            
                    test.equal(null, err);
                    test.ok(doc.maxkey instanceof MaxKey);

                    collection.findOne({"code": new Code("function () {}", {a: 77})}, function(err, doc) {            
                      test.equal(null, err);
                      test.ok(doc != null);
                      db.close();
                      test.done();
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.handleBSONTypeInsertsCorrectlyFor28OrHigher = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'], mongodb: ">=2.8.0" } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID
      , Symbol = configuration.require.Symbol
      , Double = configuration.require.Double
      , Binary = configuration.require.Binary
      , MinKey = configuration.require.MinKey
      , MaxKey = configuration.require.MaxKey
      , Code = configuration.require.Code;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('bson_types_insert');

      var document = {
          "symbol": new Symbol("abcdefghijkl")
        , "objid": new ObjectID("abcdefghijkl")
        , "double": new Double(1)
        , "binary": new Binary(new Buffer("hello world"))
        , "minkey": new MinKey()
        , "maxkey": new MaxKey()
        , "code": new Code("function () {}", {a: 55})
      }

      collection.insert(document, configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        collection.findOne({"symbol": new Symbol("abcdefghijkl")}, function(err, doc) {
          test.equal(null, err);
          test.equal("abcdefghijkl", doc.symbol.toString());

          collection.findOne({"objid": new ObjectID("abcdefghijkl")}, function(err, doc) {            
            test.equal(null, err);
            test.equal("6162636465666768696a6b6c", doc.objid.toString());

            collection.findOne({"double": new Double(1)}, function(err, doc) {            
              test.equal(null, err);
              test.equal(1, doc.double);

              collection.findOne({"binary": new Binary(new Buffer("hello world"))}, function(err, doc) {            
                test.equal(null, err);
                test.equal("hello world", doc.binary.toString());

                collection.findOne({"minkey": new MinKey()}, function(err, doc) {            
                  test.equal(null, err);
                  test.ok(doc.minkey instanceof MinKey);

                  collection.findOne({"maxkey": new MaxKey()}, function(err, doc) {            
                    test.equal(null, err);
                    test.ok(doc.maxkey instanceof MaxKey);

                    collection.findOne({"code": new Code("function () {}", {a: 55})}, function(err, doc) {            
                      test.equal(null, err);
                      test.ok(doc != null);
                      db.close();
                      test.done();
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.mixedTimestampAndDateQuery = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Timestamp = configuration.require.Timestamp;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('timestamp_date');

      var d = new Date();
      var documents = [
          { "x": new Timestamp(1, 2) }
        , { "x": d }];

      collection.insert(documents, configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        collection.findOne({"x": new Timestamp(1, 2)}, function(err, doc) {
          test.equal(null, err);
          test.ok(doc != null);

          collection.findOne({"x": d}, function(err, doc) {            
            test.equal(null, err);
            test.ok(doc != null);
            db.close();
            test.done();
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.positiveAndNegativeInfinity = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('negative_pos');
      var d = new Date();

      var document = {
          pos: Number.POSITIVE_INFINITY
        , neg: Number.NEGATIVE_INFINITY
      }

      collection.insert(document, configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        collection.findOne({}, function(err, doc) {
          test.equal(null, err);
          test.equal(Number.POSITIVE_INFINITY, doc.pos);
          test.equal(Number.NEGATIVE_INFINITY, doc.neg);
          db.close();
          test.done();
        });
      });
    });
  }
}

exports.shouldCorrectlyInsertSimpleRegExpDocument = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var regexp = /foobar/i;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_regex', function(err, collection) {
        collection.insert({'b':regexp}, configuration.writeConcernMax(), function(err, ids) {
          collection.find({}, {'fields': ['b']}).toArray(function(err, items) {
            test.equal(("" + regexp), ("" + items[0].b));
            // Let's close the db
            db.close();
            test.done();
          });
        });
      });
    });
  }
}

exports.shouldCorrectlyInsertSimpleUTF8Regexp = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var regexp = /foobaré/;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldCorrectlyInsertSimpleUTF8Regexp');

      collection.insert({'b':regexp}, configuration.writeConcernMax(), function(err, ids) {
        test.equal(null, err)

        collection.find({}, {'fields': ['b']}).toArray(function(err, items) {
          test.equal(null, err)
          test.equal(("" + regexp), ("" + items[0].b));
          // Let's close the db
          db.close();
          test.done();
        });
      });
    });
  }
}

exports.shouldCorrectlyThrowDueToIllegalCollectionName = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var k = new Buffer(15);
      for (var i = 0; i < 15; i++)
        k[i] = 0;

      k.write("hello");
      k[6] = 0x06;
      k.write("world", 10);

      try {
        var collection = db.collection(k.toString());
        test.fail(false);
      } catch (err) {
      }

      db.close();
      test.done();
    });
  }
}

exports.shouldCorrectlyHonorPromoteLongFalseNativeBSON = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long;

    var o = configuration.writeConcernMax();
    o.promoteLongs = false;
    var db = configuration.newDbInstance(o, {native_parser:true})
    db.open(function(err, db) {
      db.collection('shouldCorrectlyHonorPromoteLong').insert({
            doc: Long.fromNumber(10)
          , array: [[Long.fromNumber(10)]]
        }, function(err, doc) {
          test.equal(null, err);

          db.collection('shouldCorrectlyHonorPromoteLong').findOne(function(err, doc) {      
            test.equal(null, err);
            test.ok(doc.doc instanceof Long);
            test.ok(doc.array[0][0] instanceof Long);
            db.close();
            test.done();
          });
      });
    });
  }
}

exports.shouldCorrectlyHonorPromoteLongTrueNativeBSON = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {native_parser:true})
    db.open(function(err, db) {
      db.collection('shouldCorrectlyHonorPromoteLongTrueNativeBSON').insert({
            doc: Long.fromNumber(10)
          , array: [[Long.fromNumber(10)]]
        }, function(err, doc) {
          test.equal(null, err);

          db.collection('shouldCorrectlyHonorPromoteLongTrueNativeBSON').findOne(function(err, doc) {      test.equal(null, err);
            test.equal(null, err);
            test.ok('number', typeof doc.doc);
            test.ok('number', typeof doc.array[0][0])
            db.close();
            test.done();
          });
      });
    });
  }
}

exports.shouldCorrectlyHonorPromoteLongFalseJSBSON = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long;

    var db = configuration.newDbInstance({w:1, promoteLongs:false}, {native_parser:false})
    db.open(function(err, db) {
      db.collection('shouldCorrectlyHonorPromoteLongFalseJSBSON').insert({
            doc: Long.fromNumber(10)
          , array: [[Long.fromNumber(10)]]
        }, function(err, doc) {
          test.equal(null, err);

          db.collection('shouldCorrectlyHonorPromoteLongFalseJSBSON').findOne(function(err, doc) {      
            test.equal(null, err);
            test.equal(null, err);
            test.ok(doc.doc instanceof Long);
            test.ok(doc.array[0][0] instanceof Long);
            db.close();
            test.done();
          });
        });
    });
  }
}

exports.shouldCorrectlyHonorPromoteLongTrueJSBSON = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {native_parser:false})
    db.open(function(err, db) {
      db.collection('shouldCorrectlyHonorPromoteLongTrueJSBSON').insert({
            doc: Long.fromNumber(10)
          , array: [[Long.fromNumber(10)]]
        }, function(err, doc) {
          test.equal(null, err);

          db.collection('shouldCorrectlyHonorPromoteLongTrueJSBSON').findOne(function(err, doc) {      test.equal(null, err);
            test.equal(null, err);
            test.ok('number', typeof doc.doc);
            test.ok('number', typeof doc.array[0][0])
            db.close();
            test.done();
          });
        });
    });
  }
}

exports.shouldCorrectlyWorkWithCheckKeys = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {native_parser:false})
    db.open(function(err, db) {
      db.collection('shouldCorrectlyOverrideCheckKeysJSOnUpdate').update({
          "ps.op.t":1
        }, {'$set': {b: 1}}, {checkKeys:false}, function(err, doc) {
          test.equal(null, err);
          db.close();
          test.done();
        });
    });
  }
}

exports.shouldCorrectlyApplyBitOperator = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {native_parser:false})
    db.open(function(err, db) {
      var col = db.collection('shouldCorrectlyApplyBitOperator');

      col.insert({a:1, b:1}, function(err, result) {
        test.equal(null, err);

        col.update({a:1}, {$bit: {b: {and: 0}}}, function(err, result) {
          test.equal(null, err);

          col.findOne({a:1}, function(err, doc) {
            test.equal(null, err);
            test.equal(1, doc.a);
            test.equal(0, doc.b);

            db.close();
            test.done();
          });
        });
      });
    });
  }
}

exports.shouldCorrectlyPerformInsertAndUpdateWithFunctionSerialization = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {native_parser:false})
    db.open(function(err, db) {
      var col = db.collection('shouldCorrectlyPerformInsertAndUpdateWithFunctionSerialization', {serializeFunctions:true});
      
      col.insert({a:1, f: function(x) {return x;}},function(err,doc){
        test.equal(null,err);
        
        col.update({a:1},{$set:{f: function(y){return y;}}},function(err,doc){
          test.equal(null,err);

          col.findOne({a:1}, function(err, doc) {
            test.equal(null, err);
            test.equal("function (y){return y;}", doc.f.code);
            db.close();
            test.done();
          });
        });
      });
    });
  }
}

exports.shouldCorrectlyReportBackDuplicateIndexException = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] }, mongodb: ">2.6.3" },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {native_parser:false})
    db.open(function(err, db) {
      var col = db.collection('shouldCorrectlyReportBackDuplicateIndexException_1');
      col.ensureIndex({a:1}, {unique: true}, function(err) {
        test.equal(null, err);

        col.insert([{a:1}, {a:1}],function(err,doc) {
          test.ok(err != null);
          test.ok(err.message.indexOf('E11000') != -1);
          db.close();
          test.done();
        });        
      })
    });
  }
}