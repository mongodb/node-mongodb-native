"use strict";

var f = require('util').format,
  fs = require('fs');

// /**********************************************************************************************
//   ReplsetRep    ReplsetRepl  tReplsetRe   etRepl          Repl  t  plsetReplse  eplsetReplse
//   setReplsetR   setReplsetRe  setReplset  plsetR        plsetRepls tReplsetRepl etReplsetRep
//    pls    pls   epls    plse  epls    pls   epl        etRep  etRe lset    setR pls  Rep  et
//    tReplsetRe    tRe          etReplsetRe   et         plset        epl              set
//    lsetRepls     lsetRe       plsetRepls    pl          Repls       etRepl           epl
//    ReplsetR      Replset      tReplsetR     tR             Repls    plsetRe          et
//    setReplse     setRepl      lse           lse             etRe    tReplse          pls
//    epl   Rep  e  epl          Rep          tRep    Re        lset   lse              tRe
//    etR   setRep  etRe    tRe  set           set    se  epls  Repl   Repl    epl      lse
//   eplse  eplset eplsetR plse Replse       tReplsetRep  etReplsetR  lsetRep setR    etRepls
//   etRep   tRep  etReplsetRep setRep       lsetReplset  plsetRepl   ReplsetRepls    plsetRe
// **********************************************************************************************/

var replSetManager;

var setUp = function(configuration, options, callback) {
  var ReplSetManager = require('mongodb-topology-manager').ReplSet
    , Db = configuration.require.Db
    , Server = configuration.require.Server
    , MongoClient = configuration.require.MongoClient;

    console.log("$$$$$$$$$$$$ setup 0")
  // Check if we have any options
  if(typeof options == 'function') callback = options, options = null;

  console.log("$$$$$$$$$$$$ setup 1")
  // Override options
  if(options) {
    var rsOptions = options;
  } else {
    var rsOptions = {
      server: {
        keyFile: __dirname + '/data/keyfile.txt',
        auth: null,
        replSet: 'rs'
      },
      client: {
        replSet: 'rs'
      }
    }
  }

  console.log("$$$$$$$$$$$$ setup 2")

  // Set up the nodes
  var nodes = [{
    options: {
      bind_ip: 'localhost', port: 31000,
      dbpath: f('%s/../db/31000', __dirname),
    }
  }, {
    options: {
      bind_ip: 'localhost', port: 31001,
      dbpath: f('%s/../db/31001', __dirname),
    }
  }, {
    options: {
      bind_ip: 'localhost', port: 31002,
      dbpath: f('%s/../db/31002', __dirname),
    }
  }];

  console.log("$$$$$$$$$$$$ setup 3")

  // console.log("--------------------- setup 0")
  // Merge in any node start up options
  for(var i = 0; i < nodes.length; i++) {
    for(var name in rsOptions.server) {
      nodes[i].options[name] = rsOptions.server[name];
    }
  }

  console.log("$$$$$$$$$$$$ setup 4")

  // Create a manager
  var replicasetManager = new ReplSetManager('mongod', nodes, rsOptions.client);
  console.log("$$$$$$$$$$$$ setup 5")
  // console.log("--------------------- setup 1")
  // Purge the set
  replicasetManager.purge().then(function() {
    console.log("$$$$$$$$$$$$ setup 6")
    // console.log("--------------------- setup 2")
    // Start the server
    replicasetManager.start().then(function() {
      console.log("$$$$$$$$$$$$ setup 7")
      // console.log("--------------------- setup 3")
      setTimeout(function() {
        console.log("$$$$$$$$$$$$ setup 8")
        // console.log("--------------------- setup 4")
        callback(null, replicasetManager);
      }, 10000);
    }).catch(function(e) {
      console.log(e.stack)
      process.exit(0);
      // // console.dir(e);
    });
  });
}

/**
 * @ignore
 */
exports['NODE-746 should correctly connect using MongoClient.connect to single primary/secondary with both hosts in uri'] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db
      , Logger = configuration.require.Logger
      , MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet;

      console.log("--------------------- -2")
    setUp(configuration, function(err, replicasetManager) {
      console.log("--------------------- -1")
      var replSet = new ReplSet( [
          new Server( 'localhost', 31000),
          new Server( 'localhost', 31001)
        ],
        {rs_name: 'rs', poolSize:1}
      );

      console.log("--------------------- 0")

      // Connect
      new Db('replicaset_test_auth', replSet, {w:1}).open(function(err, db) {
        console.log("--------------------- 1")
        console.dir(err)
        // Add a user
        db.admin().addUser("root", "root", {w:3, wtimeout: 25000}, function(err, result) {
          console.log("--------------------- 2")
          console.dir(err)

          test.equal(null, err);
          db.close();
          console.log("--------------------- 3")

            console.log("--------------------- 4")

            // shut down one of the secondaries
            replicasetManager.secondaries().then(function(managers) {
            // Remove the secondary server
            replicasetManager.removeMember(managers[1], {
              returnImmediately: false, force: true, skipWait:false
            }, {
              provider: 'scram-sha-1', db: 'admin', user: 'root', password: 'root'
            }).then(function() {
              console.log("--------------------- 5")

            // // Shutdown the second secondary
            // managers[1].stop().then(function(err, result) {
            Logger.setLevel('debug');
              // Attempt to connect
              MongoClient.connect('mongodb://root:root@localhost:31000,localhost:31001/admin?replSet=rs', function(err, db) {
                console.log("--------------------- 6")
                console.dir(err)
                db.close();
                process.exit(0)

                replicasetManager.stop().then(function() {
                  console.log("--------------------- 7")
                  test.done();
                });
              });
            });
          });


          // db.admin().authenticate("root", "root", function(err, result) {
          //   console.log("--------------------- 3")
          //   test.equal(null, err);
          //   test.ok(result);
          //
          //   // replSetManager.shutdown('primary', function(err, result) {
          //   replicasetManager.stepDownPrimary(false, {stepDownSecs: 1, force:true}, {
          //     provider: 'default',
          //     db: 'admin',
          //     user: 'root',
          //     password: 'root'
          //   }).then(function() {
          //     console.log("--------------------- 4")
          //
          //     db.collection('replicaset_test_auth').insert({a:1}, {w:1}, function(err, result) {
          //       console.log("--------------------- 5")
          //       test.equal(null, err);
          //
          //       db.close();
          //
          //       replicasetManager.stop().then(function() {
          //         console.log("--------------------- 6")
          //         test.done();
          //       });
          //     });
          //   }).catch(function(e) {
          //     // // console.log(e.stack);
          //   });
          // });
        });
      });
    })
  }
}
