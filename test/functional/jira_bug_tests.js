'use strict';

var f = require('util').format;
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

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

var setUp = function(configuration, options, callback) {
  var ReplSetManager = require('mongodb-topology-manager').ReplSet;

  // Check if we have any options
  if (typeof options == 'function') (callback = options), (options = null);

  // Override options
  var rsOptions;
  if (options) {
    rsOptions = options;
  } else {
    rsOptions = {
      server: {
        keyFile: __dirname + '/data/keyfile.txt',
        auth: null,
        replSet: 'rs'
      },
      client: {
        replSet: 'rs'
      }
    };
  }

  // Set up the nodes
  var nodes = [
    {
      options: {
        bind_ip: 'localhost',
        port: 31000,
        dbpath: f('%s/../db/31000', __dirname)
      }
    },
    {
      options: {
        bind_ip: 'localhost',
        port: 31001,
        dbpath: f('%s/../db/31001', __dirname)
      }
    },
    {
      options: {
        bind_ip: 'localhost',
        port: 31002,
        dbpath: f('%s/../db/31002', __dirname)
      }
    }
  ];

  // Merge in any node start up options
  for (var i = 0; i < nodes.length; i++) {
    for (var name in rsOptions.server) {
      nodes[i].options[name] = rsOptions.server[name];
    }
  }

  // Create a manager
  var replicasetManager = new ReplSetManager('mongod', nodes, rsOptions.client);
  // Purge the set
  replicasetManager.purge().then(function() {
    // Start the server
    replicasetManager
      .start()
      .then(function() {
        setTimeout(function() {
          callback(null, replicasetManager);
        }, 10000);
      })
      .catch(function(e) {
        callback(e, null);
      });
  });
};

describe('JIRA bugs', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it(
    'NODE-746 should correctly connect using MongoClient.connect to single primary/secondary with both hosts in uri',
    {
      metadata: { requires: { topology: ['auth'] } },

      // The actual test we wish to run
      test: function(done) {
        var configuration = this.configuration;
        var Db = configuration.require.Db,
          MongoClient = configuration.require.MongoClient,
          Server = configuration.require.Server,
          ReplSet = configuration.require.ReplSet;

        setUp(configuration, function(err, replicasetManager) {
          var replSet = new ReplSet(
            [new Server('localhost', 31000), new Server('localhost', 31001)],
            {
              rs_name: 'rs',
              poolSize: 1
            }
          );

          // Connect
          new Db('replicaset_test_auth', replSet, { w: 1 }).open(function(err, db) {
            // Add a user
            db.admin().addUser('root', 'root', { w: 3, wtimeout: 25000 }, function(err) {
              test.equal(null, err);
              db.close();

              // shut down one of the secondaries
              replicasetManager.secondaries().then(function(managers) {
                // Remove the secondary server
                replicasetManager
                  .removeMember(
                    managers[1],
                    {
                      returnImmediately: false,
                      force: true,
                      skipWait: false
                    },
                    {
                      provider: 'scram-sha-1',
                      db: 'admin',
                      user: 'root',
                      password: 'root'
                    }
                  )
                  .then(function() {
                    // Attempt to connect
                    MongoClient.connect(
                      'mongodb://root:root@localhost:31000,localhost:31001/admin?replicaSet=rs',
                      function(err, db) {
                        test.equal(null, err);
                        db.close();

                        replicasetManager.stop().then(function() {
                          done();
                        });
                      }
                    );
                  });
              });
            });
          });
        });
      }
    }
  );
});
