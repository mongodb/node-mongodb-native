/**
 * @ignore
 */
exports['Should correctly receive ha'] = {
  metadata: { requires: { topology: 'replicaset' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);

      db.serverConfig.on('ha', function(e, options) {
        db.close();
        test.done();        
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly handle primary stepDown'] = {
  metadata: { requires: { topology: 'replicaset' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    // The state
    var state = 0;

    var db = configuration.newDbInstance({w:0}, {poolSize:1});
    db.open(function(err, db) {
      db.serverConfig.on('ha', function(e, options) {});
      // Wait for close event due to primary stepdown
      db.serverConfig.on('joined', function(t, s) {
        if(t == 'primary') state++;
      });

      db.serverConfig.on('left', function(t, s) {
        if(t == 'primary') state++;
      });

      // Wait fo rthe test to be done
      var interval = setInterval(function() {
        if(state == 2) {
          clearInterval(interval);
          db.close();
          test.done();
        }
      }, 500);

      // Wait for a second and then step down primary
      setTimeout(function() {
        configuration.manager.stepDown({force: true}, function(err, result) {
          // test.ok(err != null);
        });
      }, 1000);
    });
  }
}

exports['Should correctly recover from secondary shutdowns'] = {
  metadata: { requires: { topology: 'replicaset' } },

  test: function(configuration, test) {
    var ReadPreference = configuration.require.ReadPreference;
    // The state
    var primary = false;

    // Get a new instance
    var db = configuration.newDbInstance({w:0}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);
      // The state
      var left = {};
      var joined = 0;

      // Wait for left events
      db.serverConfig.on('left', function(t, s) {
        left[s.name] = ({type: t, server: s});

        // Restart the servers
        if(Object.keys(left).length == 3) {
          // Wait for close event due to primary stepdown
          db.serverConfig.on('joined', function(t, s) {
            if('primary' == t && left[s.name]) {
              joined++;
              primary = true;
            } else if('secondary' == t && left[s.name]) {
              joined++;
            }

            if(joined >= Object.keys(left).length && primary) {
              db.collection('replset_insert0').insert({a:1}, function(err, result) {
                test.equal(null, err);

                db.command({ismaster:true}
                  , {readPreference: new ReadPreference('secondary')}
                  , function(err, result) {
                    test.equal(null, err);
                    db.close();
                    test.done();
                  });
              });
            }
          });

          // Let's restart a secondary
          configuration.manager.restartServer('secondary', function(err, result) {
            // Let's restart a secondary
            configuration.manager.restartServer('secondary', function(err, result) {
            });
          });
        }
      });

      // Wait for a second and shutdown secondaries
      setTimeout(function() {
        // Shutdown the first secondary
        configuration.manager.shutdown('secondary', {signal:15}, function(err, result) {
          // Shutdown the second secondary
          configuration.manager.shutdown('secondary', {signal:15}, function(err, result) {
          });
        });
      }, 1000);
    });
  }
}

exports['Should correctly remove and re-add secondary and detect removal and re-addition of the server'] = {
  metadata: { requires: { topology: 'replicaset' } },

  test: function(configuration, test) {
    // The state
    var state = 0;
    var leftServer = null;

    // Get a new instance
    var db = configuration.newDbInstance({w:0}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);

      db.serverConfig.on('joined', function(t, s) {
        if(t == 'secondary' && leftServer && s.name == leftServer.host) {
          db.close();
          test.done();
        }
      });

      db.serverConfig.on('left', function(t, s) {
        if(t == 'secondary' && leftServer && s.name == leftServer.host) state++;
      });

      // Shutdown the first secondary
      configuration.manager.remove('secondary', function(err, serverDetails) {
        leftServer = serverDetails;

        setTimeout(function() {
          // Shutdown the second secondary
          configuration.manager.add(serverDetails, function(err, result) {});          
        }, 10000)
      });      
    });
  }
}

exports['Should correctly remove and re-add secondary with new priority and detect removal and re-addition of the server as new new primary'] = {
  metadata: { requires: { topology: 'replicaset' } },

  test: function(configuration, test) {
    // The state
    var state = 0;
    var leftServer = null;

    // Get a new instance
    var db = configuration.newDbInstance({w:0}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);

      // Add event listeners
      db.serverConfig.on('joined', function(t, s) {
        if(t == 'primary' && leftServer && s.name == leftServer.host) {
          db.close();
          test.done();
        }
      });

      db.serverConfig.on('left', function(t, s) {
        if(t == 'secondary' && leftServer && s.name == leftServer.host) state++;
      });

      // Shutdown the first secondary
      configuration.manager.remove('secondary', function(err, serverDetails) {
        serverDetails.priority = 10;
        leftServer = serverDetails;

        setTimeout(function() {
          // Shutdown the second secondary
          configuration.manager.add(serverDetails, function(err, result) {});          
        }, 10000)
      });      
    });
  }
}
