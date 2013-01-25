var mongodb = process.env['TEST_NATIVE'] != null ? require('../../../lib/mongodb').native() : require('../../../lib/mongodb').pure();

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('nodeunit'),
  gleak = require('../../../dev/tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server,
  ReadPreference = mongodb.ReadPreference,
  ReplSetServers = mongodb.ReplSetServers,
  ReplicaSetManager = require('../../../test/tools/replica_set_manager').ReplicaSetManager,
  Step = require("step");

var MONGODB = 'integration_tests';
var serverManager = null;
var RS = RS == null ? null : RS;

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.setUp = function(callback) {
  RS = new ReplicaSetManager({retries:120,
    // auth:true,
    journal:true,
    arbiter_count:0,
    secondary_count:2,
    passive_count:0});
  RS.startSet(true, function(err, result) {
    if(err != null) throw err;
    // Finish setup
    callback();
  });
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.tearDown = function(callback) {
  callback();
}

exports['Should correctly handle replicaset master stepdown and stepup without loosing auth'] = function(test) {
  var replSet = new ReplSetServers( [
      new Server( 'localhost', 30000),
      new Server( 'localhost', 30001)
    ],
    {rs_name:"replica-set-foo", poolSize:1}
  );

  // Connect
  new Db('replicaset_test_auth', replSet, {w:0}).open(function(err, db) {    
    // Just set auths for the manager to handle it correctly
    RS.setAuths("root", "root");
    // Add a user
    db.admin().addUser("root", "root", {w:3}, function(err, result) {
      test.equal(null, err);

      db.admin().authenticate("root", "root", function(err, result) {
        test.equal(null, err);
        test.ok(result);

        RS.killPrimary(9, function(err, result) {
          db.collection('replicaset_test_auth').insert({a:1}, {w:1}, function(err, result) {
            test.equal(null, err);

            db.close();
            test.done();
          });
        });
      });
    });
  });
}