var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('nodeunit'),
  gleak = require('../dev/tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Script = require('vm'),
  ObjectID = mongodb.ObjectID,
  Binary = mongodb.Binary,
  Code = mongodb.Code,
  DBRef = mongodb.DBRef,
  Timestamp = mongodb.Timestamp,
  Long = mongodb.Long,
  Collection = mongodb.Collection,
  Step = require('step'),
  Server = mongodb.Server,
  ServerManager = require('./tools/server_manager').ServerManager;

var MONGODB = 'integration_tests';
var client = null;
var useSSL = process.env['USE_SSL'] != null ? true : false;
var native_parser = (process.env['TEST_NATIVE'] != null);

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
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.setUp = function(callback) {
  var self = exports;
  client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  client.open(function(err, db_p) {
    if(numberOfTestsRun == (Object.keys(self).length)) {
      // If first test drop the db
      client.dropDatabase(function(err, done) {
        callback();
      });
    } else {
      return callback();
    }
  });
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.tearDown = function(callback) {
  var self = this;
  numberOfTestsRun = numberOfTestsRun - 1;
  // Close connection
  client.close();
  callback();
}

/**
 * A simple document insert example, not using safe mode to ensure document persistance on MongoDB
 *
 * @_class collection
 * @_function insert
 * @ignore
 */
exports.shouldCorrectlyPerformASimpleSingleDocumentInsertNoCallbackNoSafe = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017,
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {w:0, native_parser: native_parser});

  // Establish connection to db
  db.open(function(err, db) {

    // Fetch a collection to insert document into
    var collection = db.collection("simple_document_insert_collection_no_safe");
    // Insert a single document
    collection.insert({hello:'world_no_safe'});

    // Wait for a second before finishing up, to ensure we have written the item to disk
    setTimeout(function() {

      // Fetch the document
      collection.findOne({hello:'world_no_safe'}, function(err, item) {
        test.equal(null, err);
        test.equal('world_no_safe', item.hello);
        test.done();
        db.close();
      })
    }, 1000);
  });
}

/**
 * A batch document insert example, using safe mode to ensure document persistance on MongoDB
 *
 * @_class collection
 * @_function insert
 * @ignore
 */
exports.shouldCorrectlyPerformABatchDocumentInsertSafe = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017,
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {w:0, native_parser: native_parser});

  // Establish connection to db
  db.open(function(err, db) {

    // Fetch a collection to insert document into
    db.collection("batch_document_insert_collection_safe", function(err, collection) {

      // Insert a single document
      collection.insert([{hello:'world_safe1'}
        , {hello:'world_safe2'}], {w:1}, function(err, result) {
        test.equal(null, err);

        // Fetch the document
        collection.findOne({hello:'world_safe2'}, function(err, item) {
          test.equal(null, err);
          test.equal('world_safe2', item.hello);
          test.done();
          db.close();
        })
      });
    });
  });
}

/**
 * Example of inserting a document containing functions
 *
 * @_class collection
 * @_function insert
 * @ignore
 */
exports.shouldCorrectlyPerformASimpleDocumentInsertWithFunctionSafe = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017,
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {w:0, native_parser: native_parser});

  // Establish connection to db
  db.open(function(err, db) {

    // Fetch a collection to insert document into
    db.collection("simple_document_insert_with_function_safe", function(err, collection) {

      // Insert a single document
      collection.insert({hello:'world'
        , func:function() {}}, {w:1, serializeFunctions:true}, function(err, result) {
        test.equal(null, err);

        // Fetch the document
        collection.findOne({hello:'world'}, function(err, item) {
          test.equal(null, err);
          test.ok("function() {}", item.code);
          test.done();
          db.close();
        })
      });
    });
  });
}

/**
 * Example of using keepGoing to allow batch insert to complete even when there are illegal documents in the batch
 *
 * @_class collection
 * @_function insert
 * @ignore
 */
exports["Should correctly execute insert with keepGoing option on mongod >= 1.9.1"] = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017,
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {w:0, native_parser: native_parser});

  // Establish connection to db
  db.open(function(err, db) {

    // Only run the rest of the code if we have a mongodb server with version >= 1.9.1
    db.admin().serverInfo(function(err, result){

      // Ensure we are running at least MongoDB v1.9.1
      if(parseInt((result.version.replace(/\./g, ''))) >= 191) {

        // Create a collection
        client.createCollection('keepGoingExample', function(err, collection) {

          // Add an unique index to title to force errors in the batch insert
          collection.ensureIndex({title:1}, {unique:true}, function(err, indexName) {

            // Insert some intial data into the collection
            collection.insert([{name:"Jim"}
              , {name:"Sarah", title:"Princess"}], {w:1}, function(err, result) {

              // Force keep going flag, ignoring unique index issue
              collection.insert([{name:"Jim"}
                , {name:"Sarah", title:"Princess"}
                , {name:'Gump', title:"Gump"}], {w:1, keepGoing:true}, function(err, result) {

                // Count the number of documents left (should not include the duplicates)
                collection.count(function(err, count) {
                  test.equal(3, count);
                  db.close();
                  test.done();
                })
              });
            });
          });
        });
      } else {
        db.close();
        test.done();
      }
    });
  });
}

/**
 * @ignore
 */
exports.shouldForceMongoDbServerToAssignId = function(test) {
  /// Set up server with custom pk factory
  var db = new Db(MONGODB, new Server('localhost', 27017, {auto_reconnect: true, ssl:useSSL}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null), 'forceServerObjectId':true});
  db.open(function(err, client) {
    client.createCollection('test_insert2', function(err, r) {
      client.collection('test_insert2', function(err, collection) {

        Step(
          function inserts() {
            var group = this.group();

            for(var i = 1; i < 1000; i++) {
              collection.insert({c:i}, {w:1}, group());
            }
          },

          function done(err, result) {
            collection.insert({a:2}, {w:1}, function(err, r) {
              collection.insert({a:3}, {w:1}, function(err, r) {
                collection.count(function(err, count) {
                  test.equal(1001, count);
                  // Locate all the entries using find
                  collection.find().toArray(function(err, results) {
                    test.equal(1001, results.length);
                    test.ok(results[0] != null);

                    client.close();
                    // Let's close the db
                    test.done();
                  });
                });
              });
            });
          }
        )
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformSingleInsert = function(test) {
  client.createCollection('shouldCorrectlyPerformSingleInsert', function(err, collection) {
    collection.insert({a:1}, {w:1}, function(err, result) {
      collection.findOne(function(err, item) {
        test.equal(1, item.a);
        test.done();
      })
    })
  })
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformBasicInsert = function(test) {
  client.createCollection('test_insert', function(err, r) {
    client.collection('test_insert', function(err, collection) {

      Step(
        function inserts() {
          var group = this.group();

          for(var i = 1; i < 1000; i++) {
            collection.insert({c:i}, {w:1}, group());
          }
        },

        function done(err, result) {
          collection.insert({a:2}, {w:1}, function(err, r) {
            collection.insert({a:3}, {w:1}, function(err, r) {
              collection.count(function(err, count) {
                test.equal(1001, count);
                // Locate all the entries using find
                collection.find().toArray(function(err, results) {
                  test.equal(1001, results.length);
                  test.ok(results[0] != null);

                  // Let's close the db
                  test.done();
                });
              });
            });
          });
        }
      )
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleMultipleDocumentInsert = function(test) {
  client.createCollection('test_multiple_insert', function(err, r) {
    var collection = client.collection('test_multiple_insert', function(err, collection) {
      var docs = [{a:1}, {a:2}];

      collection.insert(docs, {w:1}, function(err, ids) {
        ids.forEach(function(doc) {
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
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyExecuteSaveInsertUpdate= function(test) {
  client.createCollection('shouldCorrectlyExecuteSaveInsertUpdate', function(err, collection) {
    collection.save({ email : 'save' }, {w:1}, function() {
      collection.insert({ email : 'insert' }, {w:1}, function() {
        collection.update(
          { email : 'update' },
          { email : 'update' },
          { upsert: true, w:1},

          function() {
            collection.find().toArray(function(e, a) {
              test.equal(3, a.length)
              test.done();
            });
          }
        );
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertAndRetrieveLargeIntegratedArrayDocument = function(test) {
  client.createCollection('test_should_deserialize_large_integrated_array', function(err, collection) {
    var doc = {'a':0,
      'b':['tmp1', 'tmp2', 'tmp3', 'tmp4', 'tmp5', 'tmp6', 'tmp7', 'tmp8', 'tmp9', 'tmp10', 'tmp11', 'tmp12', 'tmp13', 'tmp14', 'tmp15', 'tmp16']
    };
    // Insert the collection
    collection.insert(doc, {w:1}, function(err, r) {
      // Fetch and check the collection
      collection.findOne({'a': 0}, function(err, result) {
        test.deepEqual(doc.a, result.a);
        test.deepEqual(doc.b, result.b);
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertAndRetrieveDocumentWithAllTypes = function(test) {
  client.createCollection('test_all_serialization_types', function(err, collection) {
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

    collection.insert(motherOfAllDocuments, {w:1}, function(err, docs) {
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
        test.done();
      })
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertAndUpdateDocumentWithNewScriptContext= function(test) {
  var db = new Db(MONGODB, new Server('localhost', 27017, {auto_reconnect: true, ssl:useSSL}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  db.open(function(err, db) {
    //convience curried handler for functions of type 'a -> (err, result)
    function getResult(callback){
      return function(error, result) {
        test.ok(error == null);
        return callback(result);
      }
    };

    db.collection('users', getResult(function(user_collection){
      user_collection.remove({}, {w:1}, function(err, result) {
        //first, create a user object
        var newUser = { name : 'Test Account', settings : {} };
        user_collection.insert([newUser], {w:1}, getResult(function(users){
            var user = users[0];

            var scriptCode = "settings.block = []; settings.block.push('test');";
            var context = { settings : { thisOneWorks : "somestring" } };

            Script.runInNewContext(scriptCode, context, "testScript");

            //now create update command and issue it
            var updateCommand = { $set : context };

            user_collection.update({_id : user._id}, updateCommand, {w:1},
              getResult(function(updateCommand) {
                // Fetch the object and check that the changes are persisted
                user_collection.findOne({_id : user._id}, function(err, doc) {
                  test.ok(err == null);
                  test.equal("Test Account", doc.name);
                  test.equal("somestring", doc.settings.thisOneWorks);
                  test.equal("test", doc.settings.block[0]);

                  // Let's close the db
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

/**
 * @ignore
 */
exports.shouldCorrectlySerializeDocumentWithAllTypesInNewContext = function(test) {
  client.createCollection('test_all_serialization_types_new_context', function(err, collection) {
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

    collection.insert(context.motherOfAllDocuments, {w:1}, function(err, docs) {
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
         test.done();
       })
     });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyDoToJsonForLongValue = function(test) {
  client.createCollection('test_to_json_for_long', function(err, collection) {
    test.ok(collection instanceof Collection);

    collection.insert([{value: Long.fromNumber(32222432)}], {w:1}, function(err, ids) {
      collection.findOne({}, function(err, item) {
        test.equal(32222432, item.value);
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertAndUpdateWithNoCallback = function(test) {
  var db = new Db(MONGODB, new Server('localhost', 27017, {w:0, auto_reconnect: true, poolSize: 1, ssl:useSSL}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  db.open(function(err, client) {
    client.createCollection('test_insert_and_update_no_callback', function(err, collection) {
      // Insert the update
      collection.insert({i:1})
      // Update the record
      collection.update({i:1}, {"$set":{i:2}})

      // Make sure we leave enough time for mongodb to record the data
      setTimeout(function() {
        // Locate document
        collection.findOne({}, function(err, item) {
          test.equal(2, item.i)

          client.close();
          test.done();
        });
      }, 100)
    })
  });
}

/**
 * @ignore
 */
exports.shouldInsertAndQueryTimestamp = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017,
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {w:0, native_parser: native_parser});

  // Establish connection to db
  db.open(function(err, db) {
    db.createCollection('test_insert_and_query_timestamp', function(err, collection) {
      // Insert the update
      collection.insert({i:Timestamp.fromNumber(100), j:Long.fromNumber(200)}, {w:1}, function(err, r) {
        // Locate document
        collection.findOne({}, function(err, item) {
          test.ok(item.i instanceof Timestamp);
          test.equal(100, item.i);
          test.ok(typeof item.j == "number");
          test.equal(200, item.j);

          db.close();
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertAndQueryUndefined = function(test) {
  client.createCollection('test_insert_and_query_undefined', function(err, collection) {
    // Insert the update
    collection.insert({i:undefined}, {w:1}, function(err, r) {
      // Locate document
      collection.findOne({}, function(err, item) {
        test.equal(null, item.i)

        test.done();
      });
    })
  })
}

/**
 * @ignore
 */
exports.shouldCorrectlySerializeDBRefToJSON = function(test) {
  var dbref = new DBRef("foo", ObjectID.createFromHexString("fc24a04d4560531f00000000"), null);
  JSON.stringify(dbref);
  test.done();
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformSafeInsert = function(test) {
  var fixtures = [{
      name: "empty", array: [], bool: false, dict: {}, float: 0.0, string: ""
    }, {
      name: "not empty", array: [1], bool: true, dict: {x: "y"}, float: 1.0, string: "something"
    }, {
      name: "simple nested", array: [1, [2, [3]]], bool: true, dict: {x: "y", array: [1,2,3,4], dict: {x: "y", array: [1,2,3,4]}}, float: 1.5, string: "something simply nested"
    }];


  client.createCollection('test_safe_insert', function(err, collection) {
    Step(
      function inserts() {
        var group = this.group();

        for(var i = 0; i < fixtures.length; i++) {
          collection.insert(fixtures[i], {w:1}, group());
        }
      },

      function done() {
        collection.count(function(err, count) {
          test.equal(3, count);

          collection.find().toArray(function(err, docs) {
            test.equal(3, docs.length)
          });
        });


        var cursor = collection.find({}, {});
        var counter = 0;

        cursor.each(function(err, doc) {
          if(doc == null) {
            test.equal(3, counter);
            test.done();
          } else {
            counter = counter + 1;
          }
        });
      }
    )
  })
}

/**
 * @ignore
 */
exports.shouldThrowErrorIfSerializingFunction = function(test) {
  client.createCollection('test_should_throw_error_if_serializing_function', function(err, collection) {
    var func = function() { return 1};
    // Insert the update
    collection.insert({i:1, z:func }, {w:1, serializeFunctions:true}, function(err, result) {
      collection.findOne({_id:result[0]._id}, function(err, object) {
        test.equal(func.toString(), object.z.code);
        test.equal(1, object.i);
        test.done();
      })
    })
  })
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertDocumentWithUUID = function(test) {
  client.collection("insert_doc_with_uuid", function(err, collection) {
    collection.insert({_id : "12345678123456781234567812345678", field: '1'}, {w:1}, function(err, result) {
      test.equal(null, err);

      collection.find({_id : "12345678123456781234567812345678"}).toArray(function(err, items) {
        test.equal(null, err);
        test.equal(items[0]._id, "12345678123456781234567812345678")
        test.equal(items[0].field, '1')

        // Generate a binary id
        var binaryUUID = new Binary('00000078123456781234567812345678', Binary.SUBTYPE_UUID);

        collection.insert({_id : binaryUUID, field: '2'}, {w:1}, function(err, result) {
          collection.find({_id : binaryUUID}).toArray(function(err, items) {
            test.equal(null, err);
            test.equal(items[0].field, '2')
            test.done();
          });
        });
      })
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyCallCallbackWithDbDriverInStrictMode = function(test) {
  var db = new Db(MONGODB, new Server('localhost', 27017, {auto_reconnect: true, poolSize: 1, ssl:useSSL}), {w:1, native_parser: (process.env['TEST_NATIVE'] != null)});
  db.open(function(err, client) {
    client.createCollection('test_insert_and_update_no_callback_strict', function(err, collection) {
      collection.insert({_id : "12345678123456781234567812345678", field: '1'}, {w:1}, function(err, result) {
        test.equal(null, err);

        collection.update({ '_id': "12345678123456781234567812345678" }, { '$set': { 'field': 0 }}, function(err, numberOfUpdates) {
          test.equal(null, err);
          test.equal(1, numberOfUpdates);

          db.close();
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertDBRefWithDbNotDefined = function(test) {
  client.createCollection('shouldCorrectlyInsertDBRefWithDbNotDefined', function(err, collection) {
    var doc = {_id: new ObjectID()};
    var doc2 = {_id: new ObjectID()};
    var doc3 = {_id: new ObjectID()};
    collection.insert(doc, {w:1}, function(err, result) {
      // Create object with dbref
      doc2.ref = new DBRef('shouldCorrectlyInsertDBRefWithDbNotDefined', doc._id);
      doc3.ref = new DBRef('shouldCorrectlyInsertDBRefWithDbNotDefined', doc._id, MONGODB);

      collection.insert([doc2, doc3], {w:1}, function(err, result) {
        // Get all items
        collection.find().toArray(function(err, items) {
          test.equal("shouldCorrectlyInsertDBRefWithDbNotDefined", items[1].ref.namespace);
          test.equal(doc._id.toString(), items[1].ref.oid.toString());
          test.equal(null, items[1].ref.db);

          test.equal("shouldCorrectlyInsertDBRefWithDbNotDefined", items[2].ref.namespace);
          test.equal(doc._id.toString(), items[2].ref.oid.toString());
          test.equal(MONGODB, items[2].ref.db);

          test.done();
        })
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertUpdateRemoveWithNoOptions = function(test) {
  var db = new Db(MONGODB, new Server('localhost', 27017, {auto_reconnect: true, ssl:useSSL}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  db.open(function(err, db) {
    db.collection('shouldCorrectlyInsertUpdateRemoveWithNoOptions', function(err, collection) {
      collection.insert({a:1}, {w:1}, function(err, result) {
        test.equal(null, err);

        collection.update({a:1}, {a:2}, {w:1}, function(err, result) {
          test.equal(null, err);

          collection.remove({a:2}, {w:1}, function(err, result) {
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
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyExecuteMultipleFetches = function(test) {
  var db = new Db(MONGODB, new Server('localhost', 27017, {auto_reconnect: true, ssl:useSSL}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  // Search parameter
  var to = 'ralph'
  // Execute query
  db.open(function(err, db) {
    db.collection('shouldCorrectlyExecuteMultipleFetches', function(err, collection) {
      collection.insert({addresses:{localPart:'ralph'}}, {w:1}, function(err, result) {
        // Let's find our user
        collection.findOne({"addresses.localPart" : to}, function( err, doc ) {
          test.equal(null, err);
          test.equal(to, doc.addresses.localPart);

          db.close();
          test.done();
       });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyFailWhenNoObjectToUpdate= function(test) {
  client.createCollection('shouldCorrectlyExecuteSaveInsertUpdate', function(err, collection) {
    collection.update({_id : new ObjectID()}, { email : 'update' }, {w:1},
      function(err, result) {
        test.equal(0, result);
        test.done();
      }
    );
  });
}

/**
 * @ignore
 */
exports['Should correctly insert object and retrieve it when containing array and IsoDate'] = function(test) {
  var doc = {
   "_id" : new ObjectID("4e886e687ff7ef5e00000162"),
   "str" : "foreign",
   "type" : 2,
   "timestamp" : ISODate("2011-10-02T14:00:08.383Z"),
   "links" : [
     "http://www.reddit.com/r/worldnews/comments/kybm0/uk_home_secretary_calls_for_the_scrapping_of_the/"
   ]
  }

  client.createCollection('Should_correctly_insert_object_and_retrieve_it_when_containing_array_and_IsoDate', function(err, collection) {
    collection.insert(doc, {w:1}, function(err, result) {
      test.ok(err == null);

      collection.findOne(function(err, item) {
        test.ok(err == null);
        test.deepEqual(doc, item);
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly insert object with timestamps'] = function(test) {
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

  client.createCollection('Should_correctly_insert_object_with_timestamps', function(err, collection) {
    collection.insert(doc, {w:1}, function(err, result) {
      test.ok(err == null);

      collection.findOne(function(err, item) {
        test.ok(err == null);
        test.deepEqual(doc, item);
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should fail on insert due to key starting with $'] = function(test) {
  var doc = {
   "_id" : new ObjectID("4e886e687ff7ef5e00000162"),
   "$key" : "foreign",
  }

  client.createCollection('Should_fail_on_insert_due_to_key_starting_with', function(err, collection) {
    collection.insert(doc, {w:1}, function(err, result) {
      test.ok(err != null);
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports['Should Correctly allow for control of serialization of functions on command level'] = function(test) {
  var doc = {
    str : "String",
    func : function() {}
  }

  client.createCollection("Should_Correctly_allow_for_control_of_serialization_of_functions_on_command_level", function(err, collection) {
    test.ok(err == null);

    collection.insert(doc, {w:1}, function(err, result) {

      collection.update({str:"String"}, {$set:{c:1, d:function(){}}}, {w:1, serializeFunctions:false}, function(err, result) {
        test.equal(1, result);

        collection.findOne({str:"String"}, function(err, item) {
          test.equal(null, item.d);

          // Execute a safe insert with replication to two servers
          collection.findAndModify({str:"String"}, [['a', 1]], {'$set':{'f':function() {}}}, {new:true, safe: true, serializeFunctions:true}, function(err, result) {
            test.ok(result.f instanceof Code)
            test.done();
          })
        })
      })
    });
  });
}

/**
 * @ignore
 */
exports['Should Correctly allow for control of serialization of functions on collection level'] = function(test) {
  var doc = {
    str : "String",
    func : function() {}
  }

  client.createCollection("Should_Correctly_allow_for_control_of_serialization_of_functions_on_collection_level", {serializeFunctions:true}, function(err, collection) {
    test.ok(err == null);

    collection.insert(doc, {w:1}, function(err, result) {
      test.equal(null, err);

      collection.findOne({str : "String"}, function(err, item) {
        test.ok(item.func instanceof Code);
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should Correctly allow for using a Date object as _id'] = function(test) {
  var doc = {
    _id : new Date(),
    str : 'hello'
  }

  client.createCollection("Should_Correctly_allow_for_using_a_Date_object_as__id", {serializeFunctions:true}, function(err, collection) {
    test.ok(err == null);

    collection.insert(doc, {w:1}, function(err, result) {
      test.equal(null, err);

      collection.findOne({str : "hello"}, function(err, item) {
        test.ok(item._id instanceof Date);
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should Correctly fail to update returning 0 results'] = function(test) {
  client.createCollection("Should_Correctly_fail_to_update_returning_0_results", {serializeFunctions:true}, function(err, collection) {
    test.ok(err == null);

    collection.update({a:1}, {$set: {a:1}}, {w:1}, function(err, numberOfUpdated) {
      test.equal(0, numberOfUpdated);
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports['Should Correctly update two fields including a sub field'] = function(test) {
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

  client.createCollection("Should_Correctly_update_two_fields_including_a_sub_field", {}, function(err, collection) {
    collection.insert(doc, {w:1}, function(err, result) {
      test.equal(null, err);

      // Update two fields
      collection.update({_id:doc._id}, {$set:{Prop1:'p1_2', 'More.Sub2':'s2_2'}}, {w:1}, function(err, numberOfUpdatedDocs) {
        test.equal(null, err);
        test.equal(1, numberOfUpdatedDocs);

        collection.findOne({_id:doc._id}, function(err, item) {
          test.equal(null, err);
          test.equal('p1_2', item.Prop1);
          test.equal('s2_2', item.More.Sub2);
          test.done();
        })
      });
    })
  });
}

/**
 * @ignore
 */
exports['Should correctly fail due to duplicate key for _id'] = function(test) {
  client.createCollection("Should_Correctly_update_two_fields_including_a_sub_field_2", {}, function(err, collection) {
    collection.insert({_id:1}, {w:1}, function(err, result) {
      test.equal(null, err);

      // Update two fields
      collection.insert({_id:1}, {w:1}, function(err, result) {
        test.ok(err != null);
        test.done();
      });
    })
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyInsertDocWithCustomId = function(test) {
  client.createCollection('shouldCorrectlyInsertDocWithCustomId', function(err, collection) {
    // Insert the update
    collection.insert({_id:0, test:'hello'}, {w:1}, function(err, result) {
      test.equal(null, err);

      collection.findOne({_id:0}, function(err, item) {
        test.equal(0, item._id);
        test.equal('hello', item.test);
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldFailDueToInsertBeingBiggerThanMaxDocumentSizeAllowed = function(test) {
  var binary = new Binary(new Buffer(client.serverConfig.checkoutWriter().maxBsonSize + 100));
  // Create a collection
  client.createCollection('shouldFailDueToInsertBeingBiggerThanMaxDocumentSizeAllowed', function(err, collection) {
    collection.insert({doc:binary}, {w:1}, function(err, result) {
      test.ok(err != null);
      test.equal(null, result);
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformUpsertAgainstNewDocumentAndExistingOne = function(test) {
  client.createCollection('shouldCorrectlyPerformUpsertAgainstNewDocumentAndExistingOne', function(err, collection) {
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
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformLargeTextInsert = function(test) {
  client.createCollection('shouldCorrectlyPerformLargeTextInsert', function(err, collection) {
    // Create large string, insert and then retrive
    var string = "";
    // Create large text field
    for(var i = 0; i < 50000; i++) {
      string = string + "a";
    }

    collection.insert({a:1, string:string}, {w:1}, function(err, result) {
      test.equal(null, err);

      collection.findOne({a:1}, function(err, doc) {
        test.equal(null, err);
        test.equal(50000, doc.string.length);
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformInsertOfObjectsUsingToBSON = function(test) {
  client.createCollection('shouldCorrectlyPerformInsertOfObjectsUsingToBSON', function(err, collection) {
    // Create document with toBSON method
		var doc = {a:1, b:1};
		doc.toBSON = function() { return {c:this.a}};

    collection.insert(doc, {w:1}, function(err, result) {
      test.equal(null, err);

      collection.findOne({c:1}, function(err, doc) {
        test.equal(null, err);
        test.deepEqual(1, doc.c);
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldAttempToForceBsonSize = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017,
   {auto_reconnect: false, poolSize: 4, ssl:useSSL, disableDriverBSONSizeCheck:true}), {w:0, native_parser: native_parser});

  // Establish connection to db
  db.open(function(err, db) {
    db.createCollection('shouldAttempToForceBsonSize', function(err, collection) {
      // var doc = {a:1, b:new Binary(new Buffer(16777216)/5)}
      var doc = [
        {a:1, b:new Binary(new Buffer(16777216/2))},
        {a:1, b:new Binary(new Buffer(16777216/2))},
        {a:1, b:new Binary(new Buffer(16777216/2))},
      ]

      collection.insert(doc, {w:1}, function(err, result) {
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

/**
 * @ignore
 */
exports.shouldCorrectlyUseCustomObjectToUpdateDocument = function(test) {
  client.createCollection('shouldCorrectlyExecuteSaveInsertUpdate', function(err, collection) {
    collection.insert({a:{b:{c:1}}}, {w:1}, function(err, result) {
      test.equal(null, err);

      // Dynamically build query
      var query = {};
      query['a'] = {};
      query.a['b'] = {};
      query.a.b['c'] = 1;

      // Update document
      collection.update(query, {$set: {'a.b.d':1}}, {w:1}, function(err, numberUpdated) {
        test.equal(null, err);
        test.equal(1, numberUpdated);

        test.done();
      });
    })
  });
}

/**
 * @ignore
 */
exports.shouldExecuteInsertWithNoCallbackAndWriteConcern = function(test) {
  client.createCollection('shouldExecuteInsertWithNoCallbackAndWriteConcern', function(err, collection) {
    collection.insert({a:{b:{c:1}}});
    test.done();
  });
}

/**
 * @ignore
 */
exports.executesCallbackOnceWithOveriddenDefaultDbWriteConcern = function (test) {
  var server = new Server("127.0.0.1", 27017
      , {auto_reconnect: true, poolSize: 4, ssl:useSSL})

  var dbOpts = {w:1, native_parser: (process.env['TEST_NATIVE'] != null)};
  var client = new Db(MONGODB, server, dbOpts);

  function cb (err) {
    test.equal(null, err);
    cb.called++;
    test.equal(1, cb.called);
  }
  cb.called = 0;

  client.open(function(err, db_p) {
    client.createCollection('gh-completely', function(err, collection) {
      test.equal(null, err);
      collection.insert({ a: 1 }, { w: 0 }, cb);
      setTimeout(function(){
        client.close();
        test.done();
      }, 100)
    });
  });
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.noGlobalsLeaked = function(test) {
  var leaks = gleak.detectNew();
  test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
  test.done();
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
var numberOfTestsRun = Object.keys(this).length - 2;
