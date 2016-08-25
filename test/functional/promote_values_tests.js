exports['should correctly honor promoteValues when creating an instance using Db'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long,
      Int32 = configuration.require.Int32,
      Double = configuration.require.Double;

    var o = configuration.writeConcernMax();
    var db = configuration.newDbInstance(o, {native_parser:true, promoteValues: false})
    db.open(function(err, db) {
      db.collection('shouldCorrectlyHonorPromoteValues').insert({
            doc: Long.fromNumber(10)
          , int: 10
          , double: 2.2222
          , array: [[Long.fromNumber(10)]]
        }, function(err, doc) {
          test.equal(null, err);

          db.collection('shouldCorrectlyHonorPromoteValues').findOne(function(err, doc) {
            test.equal(null, err);

            test.deepEqual(Long.fromNumber(10), doc.doc);
            test.deepEqual(new Int32(10), doc.int);
            test.deepEqual(new Double(2.2222), doc.double);

            db.close();
            test.done();
          });
      });
    });
  }
}

exports['should correctly honor promoteValues when creating an instance using MongoClient'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long,
      Int32 = configuration.require.Int32,
      Double = configuration.require.Double,
      MongoClient = configuration.require.MongoClient;

    MongoClient.connect(configuration.url(), {
      promoteValues: false,
    }, function(err, db) {
      db.collection('shouldCorrectlyHonorPromoteValues').insert({
            doc: Long.fromNumber(10)
          , int: 10
          , double: 2.2222
          , array: [[Long.fromNumber(10)]]
        }, function(err, doc) {
          test.equal(null, err);

          db.collection('shouldCorrectlyHonorPromoteValues').findOne(function(err, doc) {
            test.equal(null, err);

            test.deepEqual(Long.fromNumber(10), doc.doc);
            test.deepEqual(new Int32(10), doc.int);
            test.deepEqual(new Double(2.2222), doc.double);

            db.close();
            test.done();
          });
      });
    });
  }
}

exports['should correctly honor promoteValues at cursor level'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long,
      Int32 = configuration.require.Int32,
      Double = configuration.require.Double,
      MongoClient = configuration.require.MongoClient;

    MongoClient.connect(configuration.url(), {
      promoteValues: false,
    }, function(err, db) {
      db.collection('shouldCorrectlyHonorPromoteValues').insert({
            doc: Long.fromNumber(10)
          , int: 10
          , double: 2.2222
          , array: [[Long.fromNumber(10)]]
        }, function(err, doc) {
          test.equal(null, err);

          db.collection('shouldCorrectlyHonorPromoteValues').find().next(function(err, doc) {
            test.equal(null, err);

            test.deepEqual(Long.fromNumber(10), doc.doc);
            test.deepEqual(new Int32(10), doc.int);
            test.deepEqual(new Double(2.2222), doc.double);

            db.close();
            test.done();
          });
      });
    });
  }
}

exports['should correctly honor promoteValues at cursor find level'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long,
      Int32 = configuration.require.Int32,
      Double = configuration.require.Double,
      MongoClient = configuration.require.MongoClient;

    MongoClient.connect(configuration.url(), {
    }, function(err, db) {
      db.collection('shouldCorrectlyHonorPromoteValues').insert({
            doc: Long.fromNumber(10)
          , int: 10
          , double: 2.2222
          , array: [[Long.fromNumber(10)]]
        }, function(err, doc) {
          test.equal(null, err);

          db.collection('shouldCorrectlyHonorPromoteValues').find({}, {}, {promoteValues: false}).next(function(err, doc) {
            test.equal(null, err);

            test.deepEqual(Long.fromNumber(10), doc.doc);
            test.deepEqual(new Int32(10), doc.int);
            test.deepEqual(new Double(2.2222), doc.double);

            db.close();
            test.done();
          });
      });
    });
  }
}

exports['should correctly honor promoteValues at aggregate level'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long,
      Int32 = configuration.require.Int32,
      Double = configuration.require.Double,
      MongoClient = configuration.require.MongoClient;

    MongoClient.connect(configuration.url(), {
    }, function(err, db) {
      db.collection('shouldCorrectlyHonorPromoteValues2').insert({
            doc: Long.fromNumber(10)
          , int: 10
          , double: 2.2222
          , array: [[Long.fromNumber(10)]]
        }, function(err, doc) {
          test.equal(null, err);

          db.collection('shouldCorrectlyHonorPromoteValues2').aggregate([{$match: {}}], {promoteValues: false}).next(function(err, doc) {
            test.equal(null, err);

            test.deepEqual(Long.fromNumber(10), doc.doc);
            test.deepEqual(new Int32(10), doc.int);
            test.deepEqual(new Double(2.2222), doc.double);

            db.close();
            test.done();
          });
      });
    });
  }
}
