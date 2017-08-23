var Buffer = require('buffer').Buffer;

exports['should correctly honor promoteBuffers when creating an instance using Db'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long,
      Int32 = configuration.require.Int32,
      Double = configuration.require.Double;

    var o = configuration.writeConcernMax();
    var client = configuration.newDbInstance(configuration.writeConcernMax(), {
      poolSize: 1,
      promoteBuffers: true
    });
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      db.collection('shouldCorrectlyHonorPromoteBuffer1').insert({
        doc: new Buffer(256)
      }, function(err, doc) {
        test.equal(null, err);

        db.collection('shouldCorrectlyHonorPromoteBuffer1').findOne(function(err, doc) {
          test.equal(null, err);
          test.ok(doc.doc instanceof Buffer);

          client.close();
          test.done();
        });
      });
    });
  }
};

exports['should correctly honor promoteBuffers when creating an instance using MongoClient'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long,
      Int32 = configuration.require.Int32,
      Double = configuration.require.Double,
      MongoClient = configuration.require.MongoClient;

    MongoClient.connect(
      configuration.url(),
      {
        promoteBuffers: true
      },
      function(err, client) {
        var db = client.db(configuration.database);

        db.collection('shouldCorrectlyHonorPromoteBuffer2').insert({
          doc: new Buffer(256)
        }, function(err, doc) {
          test.equal(null, err);

          db.collection('shouldCorrectlyHonorPromoteBuffer2').findOne(function(err, doc) {
            test.equal(null, err);
            test.ok(doc.doc instanceof Buffer);

            client.close();
            test.done();
          });
        });
      }
    );
  }
};

exports['should correctly honor promoteBuffers at cursor level'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long,
      Int32 = configuration.require.Int32,
      Double = configuration.require.Double,
      MongoClient = configuration.require.MongoClient;

    MongoClient.connect(
      configuration.url(),
      {
        promoteBuffers: true
      },
      function(err, client) {
        var db = client.db(configuration.database);

        db.collection('shouldCorrectlyHonorPromoteBuffer3').insert({
          doc: new Buffer(256)
        }, function(err, doc) {
          test.equal(null, err);

          db.collection('shouldCorrectlyHonorPromoteBuffer3').find().next(function(err, doc) {
            test.equal(null, err);
            test.ok(doc.doc instanceof Buffer);

            client.close();
            test.done();
          });
        });
      }
    );
  }
};

exports['should correctly honor promoteBuffers at cursor find level'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long,
      Int32 = configuration.require.Int32,
      Double = configuration.require.Double,
      MongoClient = configuration.require.MongoClient;

    MongoClient.connect(configuration.url(), {}, function(err, client) {
      var db = client.db(configuration.database);
      db.collection('shouldCorrectlyHonorPromoteBuffer4').insert({
        doc: new Buffer(256)
      }, function(err, doc) {
        test.equal(null, err);

        db
          .collection('shouldCorrectlyHonorPromoteBuffer4')
          .find({}, {}, { promoteBuffers: true })
          .next(function(err, doc) {
            test.equal(null, err);
            test.ok(doc.doc instanceof Buffer);

            client.close();
            test.done();
          });
      });
    });
  }
};

exports['should correctly honor promoteBuffers at aggregate level'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: {
    requires: {
      topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
      mongodb: '>=2.4.0'
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long,
      Int32 = configuration.require.Int32,
      Double = configuration.require.Double,
      MongoClient = configuration.require.MongoClient;

    MongoClient.connect(configuration.url(), {}, function(err, client) {
      var db = client.db(configuration.database);
      db.collection('shouldCorrectlyHonorPromoteBuffer5').insert({
        doc: new Buffer(256)
      }, function(err, doc) {
        test.equal(null, err);

        db
          .collection('shouldCorrectlyHonorPromoteBuffer5')
          .aggregate([{ $match: {} }], { promoteBuffers: true })
          .next(function(err, doc) {
            test.equal(null, err);
            test.ok(doc.doc instanceof Buffer);

            client.close();
            test.done();
          });
      });
    });
  }
};
