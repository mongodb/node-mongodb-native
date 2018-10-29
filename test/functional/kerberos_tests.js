'use strict';

var format = require('util').format;
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

// You need to set up the kinit tab first
// https://wiki.mongodb.com/pages/viewpage.action?title=Testing+Kerberos&spaceKey=DH
// kinit -p drivers@LDAPTEST.10GEN.CC
// password: (not shown)

describe('Kerberos', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('Should Correctly Authenticate using kerberos with MongoClient', {
    metadata: { requires: { topology: 'kerberos', os: '!win32' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;

      // KDC Server
      var server = 'ldaptest.10gen.cc';
      var principal = 'drivers@LDAPTEST.10GEN.CC';
      var urlEncodedPrincipal = encodeURIComponent(principal);
      const url = format(
        'mongodb://%s@%s/kerberos?authMechanism=GSSAPI&gssapiServiceName=mongodb&maxPoolSize=1',
        urlEncodedPrincipal,
        server
      );

      const client = configuration.newClient(url);
      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db('kerberos');

        db
          .collection('test')
          .find()
          .toArray(function(err, docs) {
            test.equal(null, err);
            test.ok(true, docs[0].kerberos);

            client.close();
            done();
          });
      });
    }
  });

  /**
   * @ignore
   */
  it('Validate that SERVICE_REALM and CANONICALIZE_HOST_NAME is passed in', {
    metadata: { requires: { topology: 'kerberos', os: '!win32' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;

      // KDC Server
      var server = 'ldaptest.10gen.cc';
      var principal = 'drivers@LDAPTEST.10GEN.CC';
      var urlEncodedPrincipal = encodeURIComponent(principal);
      const url = format(
        'mongodb://%s@%s/kerberos?authMechanism=GSSAPI&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:false,SERVICE_REALM:windows&maxPoolSize=1',
        urlEncodedPrincipal,
        server
      );

      const client = configuration.newClient(url);
      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db('kerberos');

        db
          .collection('test')
          .find()
          .toArray(function(err, docs) {
            test.equal(null, err);
            test.ok(true, docs[0].kerberos);

            client.close();
            done();
          });
      });
    }
  });

  /**
   * @ignore
   */
  it(
    'Should Correctly Authenticate using kerberos with MongoClient and authentication properties',
    {
      metadata: { requires: { topology: 'kerberos', os: '!win32' } },

      // The actual test we wish to run
      test: function(done) {
        var configuration = this.configuration;

        // KDC Server
        var server = 'ldaptest.10gen.cc';
        var principal = 'drivers@LDAPTEST.10GEN.CC';
        var urlEncodedPrincipal = encodeURIComponent(principal);
        const url = format(
          'mongodb://%s@%s/kerberos?authMechanism=GSSAPI&authMechanismProperties=SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:false&maxPoolSize=1',
          urlEncodedPrincipal,
          server
        );

        const client = configuration.newClient(url);
        client.connect(function(err, client) {
          test.equal(null, err);
          var db = client.db('kerberos');

          db
            .collection('test')
            .find()
            .toArray(function(err, docs) {
              test.equal(null, err);
              test.ok(true, docs[0].kerberos);

              client.close();
              done();
            });
        });
      }
    }
  );

  /**
   * @ignore
   */
  it('Should Correctly Authenticate using kerberos with MongoClient and then reconnect', {
    metadata: { requires: { topology: 'kerberos', os: '!win32' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;

      // KDC Server
      var server = 'ldaptest.10gen.cc';
      var principal = 'drivers@LDAPTEST.10GEN.CC';
      var urlEncodedPrincipal = encodeURIComponent(principal);
      const url = format(
        'mongodb://%s@%s/kerberos?authMechanism=GSSAPI&gssapiServiceName=mongodb&maxPoolSize=5',
        urlEncodedPrincipal,
        server
      );

      const client = configuration.newClient(url);
      client.connect(function(err, client) {
        test.equal(null, err);

        client
          .db('kerberos')
          .collection('test')
          .findOne(function(err, doc) {
            test.equal(null, err);
            test.equal(true, doc.kerberos);

            client.topology.once('reconnect', function() {
              // Await reconnect and re-authentication
              client
                .db('kerberos')
                .collection('test')
                .findOne(function(err, doc) {
                  test.equal(null, err);
                  test.equal(true, doc.kerberos);

                  // Attempt disconnect again
                  client.topology.connections()[0].destroy();

                  // Await reconnect and re-authentication
                  client
                    .db('kerberos')
                    .collection('test')
                    .findOne(function(err, doc) {
                      test.equal(null, err);
                      test.equal(true, doc.kerberos);

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

  /**
   * @ignore
   */
  it('Should Correctly Authenticate authenticate method manually', {
    metadata: { requires: { topology: 'kerberos', os: '!win32' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server;

      // KDC Server
      var server = 'ldaptest.10gen.cc';
      var principal = 'drivers@LDAPTEST.10GEN.CC';

      var client = new MongoClient(new Server(server, 27017), {
        w: 1,
        user: principal,
        authMechanism: 'GSSAPI'
      });
      client.connect(function(err, client) {
        test.equal(null, err);

        // Await reconnect and re-authentication
        client
          .db('kerberos')
          .collection('test')
          .findOne(function(err, doc) {
            test.equal(null, err);
            test.equal(true, doc.kerberos);

            client.close();
            done();
          });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should Fail to Authenticate due to illegal service name', {
    metadata: { requires: { topology: 'kerberos', os: '!win32' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;

      // KDC Server
      var server = 'ldaptest.10gen.cc';
      var principal = 'drivers@LDAPTEST.10GEN.CC';
      var urlEncodedPrincipal = encodeURIComponent(principal);
      const url = format(
        'mongodb://%s@%s/test?authMechanism=GSSAPI&gssapiServiceName=mongodb2&maxPoolSize=1',
        urlEncodedPrincipal,
        server
      );

      const client = configuration.newClient(url);
      client.connect(function(err) {
        test.ok(err != null);
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('Should Correctly Authenticate on Win32 using kerberos with MongoClient', {
    metadata: { requires: { topology: 'kerberos', os: 'win32' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;

      // KDC Server
      var server = 'ldaptest.10gen.cc';
      var principal = 'drivers@LDAPTEST.10GEN.CC';
      var pass = process.env['LDAPTEST_PASSWORD'];

      if (pass == null) throw new Error('The env parameter LDAPTEST_PASSWORD must be set');
      var urlEncodedPrincipal = encodeURIComponent(principal);
      const url = format(
        'mongodb://%s:%s@%s/kerberos?authMechanism=GSSAPI&maxPoolSize=1',
        urlEncodedPrincipal,
        pass,
        server
      );

      const client = configuration.newClient(url);
      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db('kerberos');

        db
          .collection('test')
          .find()
          .toArray(function(err, docs) {
            test.equal(null, err);
            test.ok(true, docs[0].kerberos);

            client.close();
            done();
          });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should Correctly Authenticate using kerberos on Win32 with MongoClient and then reconnect', {
    metadata: { requires: { topology: 'kerberos', os: 'win32' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;

      // KDC Server
      var server = 'ldaptest.10gen.cc';
      var principal = 'drivers@LDAPTEST.10GEN.CC';
      var pass = process.env['LDAPTEST_PASSWORD'];
      if (pass == null) throw new Error('The env parameter LDAPTEST_PASSWORD must be set');
      var urlEncodedPrincipal = encodeURIComponent(principal);
      const url = format(
        'mongodb://%s:%s@%s/kerberos?authMechanism=GSSAPI&maxPoolSize=5',
        urlEncodedPrincipal,
        pass,
        server
      );

      const client = configuration.newClient(url);
      client.connect(function(err, client) {
        test.equal(null, err);

        client
          .db('kerberos')
          .collection('test')
          .findOne(function(err, doc) {
            test.equal(null, err);
            test.equal(true, doc.kerberos);

            client.topology.once('reconnect', function() {
              // Await reconnect and re-authentication
              client
                .db('kerberos')
                .collection('test')
                .findOne(function(err, doc) {
                  test.equal(null, err);
                  test.equal(true, doc.kerberos);

                  // Attempt disconnect again
                  client.topology.connections()[0].destroy();

                  // Await reconnect and re-authentication
                  client
                    .db('kerberos')
                    .collection('test')
                    .findOne(function(err, doc) {
                      test.equal(null, err);
                      test.equal(true, doc.kerberos);

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

  /**
   * @ignore
   */
  it('Should Correctly Authenticate on Win32 authenticate method manually', {
    metadata: { requires: { topology: 'kerberos', os: 'win32' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server;

      // KDC Server
      var server = 'ldaptest.10gen.cc';
      var principal = 'drivers@LDAPTEST.10GEN.CC';
      var pass = process.env['LDAPTEST_PASSWORD'];
      if (pass == null) throw new Error('The env parameter LDAPTEST_PASSWORD must be set');
      var client = new MongoClient(new Server(server, 27017), {
        w: 1,
        user: principal,
        password: pass,
        authMechanism: 'GSSAPI'
      });

      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db('kerberos');

        db
          .collection('test')
          .find()
          .toArray(function(err, docs) {
            test.equal(null, err);
            test.ok(true, docs[0].kerberos);

            client.close();
            done();
          });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should Fail to Authenticate due to illegal service name on win32', {
    metadata: { requires: { topology: 'kerberos', os: 'win32' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;

      // KDC Server
      var server = 'ldaptest.10gen.cc';
      var principal = 'drivers@LDAPTEST.10GEN.CC';
      var pass = process.env['LDAPTEST_PASSWORD'];

      if (pass == null) throw new Error('The env parameter LDAPTEST_PASSWORD must be set');
      var urlEncodedPrincipal = encodeURIComponent(principal);
      const url = format(
        'mongodb://%s:%s@%s/kerberos?authMechanism=GSSAPI&gssapiServiceName=mongodb2&maxPoolSize=1',
        urlEncodedPrincipal,
        pass,
        server
      );

      const client = configuration.newClient(url);
      client.connect(function(err) {
        test.ok(err != null);
        done();
      });
    }
  });
});
