'use strict';

var format = require('util').format;

/**
 * @ignore
 */
exports['Should correctly authenticate against ldap'] = {
  metadata: { requires: { topology: 'ldap' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db,
      MongoClient = configuration.require.MongoClient,
      Server = configuration.require.Server;

    // KDC Server
    var server = 'ldaptest.10gen.cc';
    var user = 'drivers-team';
    var pass = 'mongor0x$xgen';

    // Url
    var url = format(
      'mongodb://%s:%s@%s/test?authMechanism=PLAIN&maxPoolSize=1',
      user,
      pass,
      server
    );

    // Let's write the actual connection code
    MongoClient.connect(url, function(err, client) {
      test.equal(null, err);
      var db = client.db(configuration.database);

      client.db('ldap').collection('test').findOne(function(err, doc) {
        test.equal(null, err);
        test.equal(true, doc.ldap);

        client.close();
        test.done();
      });
    });
  }
};

/**
 * @ignore
 */
exports['Should correctly reauthenticate against ldap'] = {
  metadata: { requires: { topology: 'ldap' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db,
      MongoClient = configuration.require.MongoClient,
      Server = configuration.require.Server;

    // KDC Server
    var server = 'ldaptest.10gen.cc';
    var user = 'drivers-team';
    var pass = 'mongor0x$xgen';

    // Url
    var url = format(
      'mongodb://%s:%s@%s/test?authMechanism=PLAIN&maxPoolSize=1',
      user,
      pass,
      server
    );

    // Let's write the actual connection code
    MongoClient.connect(url, function(err, client) {
      test.equal(null, err);
      var db = client.db(configuration.database);

      client.db('ldap').collection('test').findOne(function(err, doc) {
        test.equal(null, err);
        test.equal(true, doc.ldap);

        client.topology.once('reconnect', function() {
          // Await reconnect and re-authentication
          client.db('ldap').collection('test').findOne(function(err, doc) {
            test.equal(null, err);
            test.equal(true, doc.ldap);

            // Attempt disconnect again
            client.topology.connections()[0].destroy();

            // Await reconnect and re-authentication
            client.db('ldap').collection('test').findOne(function(err, doc) {
              test.equal(null, err);
              test.equal(true, doc.ldap);

              client.close();
              test.done();
            });
          });
        });

        // Force close
        client.topology.connections()[0].destroy();
      });
    });
  }
};
