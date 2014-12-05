"use strict";

var format = require('util').format;

/**
 * @ignore
 */
exports['Should correctly authenticate against ldap'] = {
  metadata: { requires: { topology: 'ldap' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db
      , MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server;

    // KDC Server
    var server = "ldaptest.10gen.cc";
    var user = "drivers-team";
    var pass = "mongor0x$xgen";

    // Url
    var url = format("mongodb://%s:%s@%s/test?authMechanism=PLAIN&maxPoolSize=1", user, pass, server);

    // Let's write the actual connection code
    MongoClient.connect(url, function(err, db) {
      test.equal(null, err);    

      db.db('ldap').collection('test').findOne(function(err, doc) {
        test.equal(null, err);
        test.equal(true, doc.ldap);
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly reauthenticate against ldap'] = {
  metadata: { requires: { topology: 'ldap' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db
      , MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server;

    // KDC Server
    var server = "ldaptest.10gen.cc";
    var user = "drivers-team";
    var pass = "mongor0x$xgen";

    // Url
    var url = format("mongodb://%s:%s@%s/test?authMechanism=PLAIN&maxPoolSize=1", user, pass, server);

    // Let's write the actual connection code
    MongoClient.connect(url, function(err, db) {
      test.equal(null, err);    

      db.db('ldap').collection('test').findOne(function(err, doc) {
        test.equal(null, err);
        test.equal(true, doc.ldap);

        db.serverConfig.on('reconnect', function() {
          // Await reconnect and re-authentication    
          db.db('ldap').collection('test').findOne(function(err, doc) {
            test.equal(null, err);
            test.equal(true, doc.ldap);

            // Attempt disconnect again
            db.serverConfig.allRawConnections()[0].connection.destroy()

            // Await reconnect and re-authentication    
            db.db('ldap').collection('test').findOne(function(err, doc) {
              test.equal(null, err);
              test.equal(true, doc.ldap);

              test.done();
            });
          });
        })
        
        // Force close
        db.serverConfig.allRawConnections()[0].connection.destroy()
      });
    });
  }
}