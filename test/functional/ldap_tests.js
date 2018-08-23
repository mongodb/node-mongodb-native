'use strict';

var format = require('util').format;
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

describe('LDAP', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('Should correctly authenticate against ldap', {
    metadata: { requires: { topology: 'ldap' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;

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

      const client = configuration.newClient(url);
      client.connect(function(err, client) {
        test.equal(null, err);

        client
          .db('ldap')
          .collection('test')
          .findOne(function(err, doc) {
            test.equal(null, err);
            test.equal(true, doc.ldap);

            client.close();
            done();
          });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly reauthenticate against ldap', {
    metadata: { requires: { topology: 'ldap' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;

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

      const client = configuration.newClient(url);
      client.connect(function(err, client) {
        test.equal(null, err);

        client
          .db('ldap')
          .collection('test')
          .findOne(function(err, doc) {
            test.equal(null, err);
            test.equal(true, doc.ldap);

            client.topology.once('reconnect', function() {
              // Await reconnect and re-authentication
              client
                .db('ldap')
                .collection('test')
                .findOne(function(err, doc) {
                  test.equal(null, err);
                  test.equal(true, doc.ldap);

                  // Attempt disconnect again
                  client.topology.connections()[0].destroy();

                  // Await reconnect and re-authentication
                  client
                    .db('ldap')
                    .collection('test')
                    .findOne(function(err, doc) {
                      test.equal(null, err);
                      test.equal(true, doc.ldap);

                      client.close();
                      done();
                    });
                });
            });

            // Force close
            client.topology.connections()[0].destroy();
          });
      });
    }
  });
});
