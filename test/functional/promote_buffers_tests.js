var Buffer = require('buffer').Buffer;

exports['should correctly honor promoteBuffers when creating an instance using Db'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long,
      Int32 = configuration.require.Int32,
      Double = configuration.require.Double;

    var o = configuration.writeConcernMax();
    var db = configuration.newDbInstance(o, {native_parser:true, promoteBuffers: true})
    db.open(function(err, db) {
      db.collection('shouldCorrectlyHonorPromoteBuffer1').insert({
          doc: new Buffer(256)
        }, function(err, doc) {
          test.equal(null, err);

          db.collection('shouldCorrectlyHonorPromoteBuffer1').findOne(function(err, doc) {
            test.equal(null, err);
            test.ok(doc.doc instanceof Buffer);

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
      promoteBuffers: true,
    }, function(err, db) {
      db.collection('shouldCorrectlyHonorPromoteValues2').insert({
          doc: new Buffer(256)
        }, function(err, doc) {
          test.equal(null, err);

          db.collection('shouldCorrectlyHonorPromoteValues2').findOne(function(err, doc) {
            test.equal(null, err);
            test.ok(doc.doc instanceof Buffer);

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
      promoteBuffers: true,
    }, function(err, db) {
      db.collection('shouldCorrectlyHonorPromoteValues3').insert({
          doc: new Buffer(256)
        }, function(err, doc) {
          test.equal(null, err);

          db.collection('shouldCorrectlyHonorPromoteValues3').find().next(function(err, doc) {
            test.equal(null, err);
            test.ok(doc.doc instanceof Buffer);

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
      db.collection('shouldCorrectlyHonorPromoteValues4').insert({
          doc: new Buffer(256)
        }, function(err, doc) {
          test.equal(null, err);

          db.collection('shouldCorrectlyHonorPromoteValues4').find({}, {}, {promoteBuffers: true}).next(function(err, doc) {
            test.equal(null, err);
            test.ok(doc.doc instanceof Buffer);

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
      db.collection('shouldCorrectlyHonorPromoteValues5').insert({
          doc: new Buffer(256)
        }, function(err, doc) {
          test.equal(null, err);

          db.collection('shouldCorrectlyHonorPromoteValues5').aggregate([{$match: {}}], {promoteBuffers: true}).next(function(err, doc) {
            test.equal(null, err);
            test.ok(doc.doc instanceof Buffer);

            db.close();
            test.done();
          });
      });
    });
  }
}
