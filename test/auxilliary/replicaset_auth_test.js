var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();

var testCase = require('../../deps/nodeunit').testCase,
  debug = require('util').debug
  inspect = require('util').inspect,
  nodeunit = require('../../deps/nodeunit'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server,
  ReplSetServers = mongodb.ReplSetServers,
  ReplicaSetManager = require('../../test/tools/replica_set_manager').ReplicaSetManager,
  Step = require("../../deps/step/lib/step");  

var MONGODB = 'integration_tests';
// var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 1}), {native_parser: (process.env['TEST_NATIVE'] != null)});
var serverManager = null;

// Define the tests, we want them to run as a nested test so we only clean up the 
// db connection once
var tests = testCase({
  setUp: function(callback) {
    RS = new ReplicaSetManager({retries:120, 
      auth:true, 
      arbiter_count:0,
      secondary_count:1,
      passive_count:0});
    RS.startSet(true, function(err, result) {      
      if(err != null) throw err;
      // Finish setup
      callback();      
    });      
  },
  
  tearDown: function(callback) {
    RS.killAll(function() {
      callback();                      
    });
  },

  shouldCorrectlyAuthenticateWithMultipleLoginsAndLogouts : function(test) {
    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      ], 
      {rs_name:RS.name}
    );
    
    // Connect to the replicaset
    var slaveDb = null;
    var db = new Db('foo', replSet, {native_parser: (process.env['TEST_NATIVE'] != null)});
    db.open(function(err, p_db) {
      // console.log("-------------------------------------------------------------------------------- -1")
      // console.dir(err)      
      
      Step(
        function addUser() {
          // console.log("-------------------------------------------------------------------------------- 0")
          db.admin().addUser("me", "secret", this);
        },
        
        function ensureFailingInsert(err, result) {
          // console.log("-------------------------------------------------------------------------------- 1")
          // console.dir(err)
          // console.dir(result)
          var self = this;
          test.equal(null, err);
          test.ok(result != null);
  
          db.collection("stuff", function(err, collection) {
            // console.log("-------------------------------------------------------------------------------- 2")
            // console.dir(err)
            collection.insert({a:2}, {safe: {w: 3}}, self);
          });                  
        },
        
        function authenticate(err, result) {
          // console.log("-------------------------------------------------------------------------------- 3")
          // console.dir(err)
          // console.dir(result)
          test.ok(err != null);
          
          db.admin().authenticate("me", "secret", this);
        },
        
        function insertShouldSuccedNow(err, result) {
          // console.log("-------------------------------------------------------------------------------- 4")
          // console.dir(err)
          // console.log(err != null ? err.stack : '')
          // console.dir(result)
          var self = this;
          test.equal(null, err);
          test.ok(result);
  
          db.collection("stuff", function(err, collection) {
            // console.log("-------------------------------------------------------------------------------- 5")
            // console.dir(err)
            collection.insert({a:3}, {safe: true}, self);
          });                            
        }, 
        
        function queryShouldExecuteCorrectly(err, result) {
          // console.log("-------------------------------------------------------------------------------- 6")
          // console.dir(err)
          // console.dir(result)
          var self = this;
          test.equal(null, err);
          
          db.collection("stuff", function(err, collection) {
            // console.log("-------------------------------------------------------------------------------- 7")
            // console.dir(err)
            collection.findOne(self);
          });                            
        },
        
        function logout(err, item) {
          // console.log("-------------------------------------------------------------------------------- 8")
          // console.dir(err)
          // console.dir(item)
          test.ok(err == null);
          test.equal(3, item.a);
          
          db.admin().logout(this);
        },
        
        function findShouldFailDueToLoggedOut(err, result) {
          // console.log("-------------------------------------------------------------------------------- 9")
          // console.dir(err)
          // console.dir(result)
  
          var self = this;
          test.equal(null, err);
          
          db.collection("stuff", function(err, collection) {
            // console.log("-------------------------------------------------------------------------------- 10")
            // console.dir(err)
            collection.findOne(self);
          });
        },
        
        function sameShouldApplyToRandomSecondaryServer(err, result) {
          // console.log("-------------------------------------------------------------------------------- 11")
          // console.dir(err)
          // console.dir(result)
          var self = this;
          test.ok(err != null);
          
          slaveDb = new Db('foo', new Server(db.serverConfig.secondaries[0].host
                    , db.serverConfig.secondaries[0].port, {auto_reconnect: true, poolSize: 1}), {native_parser: (process.env['TEST_NATIVE'] != null), slave_ok:true});
          slaveDb.open(function(err, slaveDb) {            
            // console.log("-------------------------------------------------------------------------------- 12")
            // console.dir(err)
            slaveDb.collection('stuff', function(err, collection) {
              // console.log("-------------------------------------------------------------------------------- 13")
              // console.dir(err)
              collection.findOne(self)
            })            
          });
        },
        
        function shouldCorrectlyAuthenticateAgainstSecondary(err, result) {
          // console.log("-------------------------------------------------------------------------------- 14")
          // console.dir(err)
          // console.dir(result)
          test.ok(err != null)          
          slaveDb.admin().authenticate('me', 'secret', this);
        },
        
        function shouldCorrectlyInsertItem(err, result) {
          // console.log("-------------------------------------------------------------------------------- 15")
          // console.dir(err)
          // console.dir(result)
          var self = this;          
          test.equal(null, err);
          test.ok(result);
          
          slaveDb.collection('stuff', function(err, collection) {
            // console.log("-------------------------------------------------------------------------------- 16")
            // console.dir(err)
            collection.findOne(self)
          })                      
        },
        
        function finishUp(err, item) {
          // console.log("-------------------------------------------------------------------------------- 17")
          // console.dir(err)
          // console.dir(item)
          test.ok(err == null);
          test.equal(3, item.a);          
          
          test.done();
          p_db.close();
          slaveDb.close();
        }
      )      
    });
  },
  
  shouldCorrectlyAuthenticate : function(test) {
    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      ], 
      {rs_name:RS.name, read_secondary:true}
    );
    
    // Connect to the replicaset
    var slaveDb = null;
    var db = new Db('foo', replSet, {native_parser: (process.env['TEST_NATIVE'] != null)});
    db.open(function(err, p_db) {
      // console.log("-------------------------------------------------------------------------------- 0")
      // console.dir(err)
  
      Step(
        function addUser() {
          db.admin().addUser("me", "secret", this);
        },
        
        function ensureFailingInsert(err, result) {
          // console.log("-------------------------------------------------------------------------------- 1")
          // console.dir(err)
          // console.dir(result)
          var self = this;
          test.equal(null, err);
          test.ok(result != null);
  
          db.collection("stuff", function(err, collection) {
            collection.insert({a:2}, {safe: {w: 2, wtimeout: 10000}}, self);
          });                  
        },
        
        function authenticate(err, result) {
          // console.log("-------------------------------------------------------------------------------- 2")
          // console.dir(err)
          // console.dir(result)
          test.ok(err != null);
          
          db.admin().authenticate("me", "secret", this);
        },
        
        function insertShouldSuccedNow(err, result) {
          // console.log("-------------------------------------------------------------------------------- 3")
          // console.dir(err)
          // console.dir(result)
          var self = this;
          test.equal(null, err);
          test.ok(result);
  
          db.collection("stuff", function(err, collection) {
            collection.insert({a:2}, {safe: {w: 2, wtimeout: 10000}}, self);
          });                            
        }, 
        
        function queryShouldExecuteCorrectly(err, result) {
          // console.log("-------------------------------------------------------------------------------- 4")
          // console.dir(err)
          // console.dir(result)
          var self = this;
          test.equal(null, err);
          
          db.collection("stuff", function(err, collection) {
            collection.findOne(self);
          });                            
        },
        
        function finishUp(err, item) {
          // console.log("-------------------------------------------------------------------------------- 5")
          // console.dir(err)
          // console.dir(item)
          test.ok(err == null);
          test.equal(2, item.a);
          test.done();
          p_db.close();
        }      
      )      
    });
  }  
})

// Assign out tests
module.exports = tests;