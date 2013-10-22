exports['Should Correctly group using replicaset'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    ReadPreference = mongo.ReadPreference;

  var db = configuration.db();  
  var collection = db.collection('testgroup_replicaset', {
        readPreference: ReadPreference.SECONDARY
      , w:2, wtimeout: 10000
    });
  
  collection.insert([{key:1,x:10}, {key:2,x:30}, {key:1,x:20}, {key:3,x:20}], {safe:{w:3, wtimeout:10000}}, function(err, result) {
    // Kill the primary
    configuration.killPrimary(function(node) {
      // Do a collection find
      collection.group(['key'], {}, {sum:0}, function reduce(record, memo){
        memo.sum += record.x;
      }, true, function(err, items){
        // console.dir(items)
        test.equal(null, err);
        test.equal(3, items.length);
        // process.exit(0);
        test.done();
      })
    });
  });
}

exports['Should fail to do map reduce to out collection'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    ReadPreference = mongo.ReadPreference;

  var db = configuration.db();  
  var collection = db.collection('test_map_reduce_functions_notInline_map_reduce', {
        readPreference: ReadPreference.SECONDARY
      , w:2, wtimeout: 10000
    });

  // Parse version of server if available
  db.admin().serverInfo(function(err, result){

    // Only run if the MongoDB version is higher than 1.7.6
    if(parseInt((result.version.replace(/\./g, ''))) >= 176) {
      // Map function
      var map = function() { emit(this.user_id, 1); };
      // Reduce function
      var reduce = function(k,vals) { return 1; };

      // Execute map reduce and return results inline
      collection.mapReduce(map, reduce
        , {out : {replace:'replacethiscollection'}, readPreference:ReadPreference.SECONDARY}, function(err, results) {
        test.done();            
      });
    } else {
      test.done();
    }
  });
}

exports['Should correctly query secondaries'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers( [ 
      new Server(replicasetManager.host, replicasetManager.ports[0]),
    ], 
    {rs_name:replicasetManager.name, read_secondary:true}
  );

  // Insert some data
  var db = new Db('integration_test_', replSet, {w:0});
  db.open(function(err, p_db) {
    
    var collection = db.collection('testsets', {w:3, wtimeout:10000});      
    collection.insert([{a:20}, {a:30}, {a:40}], {safe:{w:3, wtimeout:10000}}, function(err, result) {
      // Kill the primary
      configuration.killPrimary(2, function(node) {

        collection.find().setReadPreference(ReadPreference.SECONDARY).toArray(function(err, items) {
          test.equal(null, err);
          test.equal(3, items.length);                
          p_db.close();
          test.done();
        });
      });
    });
  });
}

exports['Should allow to force read with primary'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    ReadPreference = mongo.ReadPreference;

  var db = configuration.db();  
  var collection = db.collection('shouldAllowToForceReadWithPrimary');
  // console.log("=============================================================== 0")

  // Insert a document
  collection.insert({a:1}, {w:2, wtimeout:10000}, function(err, result) {
    test.equal(null, err);
    // console.log("=============================================================== 1")
    
    // Force read using primary
    var cursor = collection.find({}, {readPreference: ReadPreference.PRIMARY});
    // Get documents
    cursor.toArray(function(err, items) {
      // console.log("=============================================================== 2")
      test.equal(1, items.length);          
      test.equal(1, items[0].a);
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly read from secondary even if primary is down'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name, readPreference:ReadPreference.PRIMARY_PREFERRED}
  );

  new Db('integration_test_', replSet, {w:0}).open(function(err, p_db) {
    test.ok(err == null);
    test.equal(true, p_db.serverConfig.isConnected());

    var collection = p_db.collection('notempty');

    // Insert a document
    collection.insert({a:1}, {w:2, wtimeout:10000}, function(err, result) {
      
      // Run a simple query
      collection.findOne(function (err, doc) {
        // console.log("======================================== 0")
        // console.dir(err)
        // console.dir(doc)
        test.ok(err == null);
        test.ok(1, doc.a);

        // Shut down primary server
        configuration.killPrimary(function (err, result) {
          test.ok(Object.keys(replSet._state.secondaries).length > 0);

          // Run a simple query
          collection.findOne(function (err, doc) {
            // console.log("======================================== 1")
            // console.dir(err)
            // console.dir(doc)

            test.ok(Object.keys(replSet._state.secondaries).length > 0);
            test.equal(null, err);
            test.ok(doc != null);

            p_db.close();
            test.done();
          });
        });
      });
    });  
  });
}

