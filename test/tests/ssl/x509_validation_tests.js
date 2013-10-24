var fs = require('fs')
  , f = require('util').format;

/**
 * @ignore
 */
exports['Should correctly authenticate using x509'] = function(configuration, test) {
  var ServerManager = require('../../tools/server_manager').ServerManager
    , MongoClient = configuration.getMongoPackage().MongoClient;

  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];

  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/certificates/client.pem");
  var key = fs.readFileSync(__dirname + "/certificates/client.pem");

  // User name
  var userName = "CN=client,OU=kerneluser,O=10Gen,L=New York City,ST=New York,C=US";
  
  // Start server
  serverManager = new ServerManager({
      auth:false
    , purgedirectories:true
    , journal:true
    , ssl:true
    , ssl_ca: '../test/tests/ssl/certificates/ca.pem'
    , ssl_crl: '../test/tests/ssl/certificates/crl.pem'
    , ssl_server_pem: "../test/tests/ssl/certificates/server.pem"
    , ssl_force_validate_certificates: true
    , ssl_client_pem: cert
    // EnsureUp options
    , host: 'server'
    , sslValidate:true
    , sslCA:ca
    , sslKey:key
    , sslCert:cert
  });

  serverManager.start(true, function() {
    // Connect and validate the server certificate
    MongoClient.connect("mongodb://server:27017/test?ssl=true&maxPoolSize=1", {
      server: {
          sslValidate:true
        , sslCA:ca
        , sslKey:key
        , sslCert:cert
        , sslPass:'10gen'
      }
    }, function(err, db) {
      test.equal(null, err);
      test.ok(db != null);

      // Add the X509 auth user to the $external db
      var ext = db.db('$external');
      ext.addUser(userName, {roles: [
        {'role': 'readWriteAnyDatabase', 'db': 'admin'},
        {'role': 'userAdminAnyDatabase', 'db': 'admin'}        
      ]}, function(err, result) {
        test.equal(null, err);
        test.equal(userName, result[0].user);
        test.equal('', result[0].pwd);
        db.close();

        // Connect using X509 authentication
        MongoClient.connect(f('mongodb://%s@server:27017/test?authMechanism=%s&ssl=true&maxPoolSize=1'
            , encodeURIComponent(userName), 'MONGODB-X509'), {
          server: {
              sslValidate:true
            , sslCA:ca
            , sslKey:key
            , sslCert:cert
            , sslPass:'10gen'
          }
        }, function(err, db) {

          console.log("--------------------------------------------- 0")
          console.dir(err)
          console.dir(result)

          db.close();
          serverManager.killAll();
          test.done();
        });
      });
    });
  });

// if not CERT_SSL:
//             raise SkipTest("No mongod available over SSL with certs")
//         client = MongoClient(host, port, ssl=True, ssl_certfile=CLIENT_PEM)
//         if not version.at_least(client, (2, 5, 3, -1)):
//             raise SkipTest("MONGODB-X509 tests require MongoDB 2.5.3 or newer")
//         argv = get_command_line(client)
//         if '--auth' not in argv:
//             raise SkipTest("Mongo must be started with "
//                            "--auth to test MONGODB-X509")
//         # Give admin all necessary priviledges.
//         client['$external'].add_user(MONGODB_X509_USERNAME, roles=[
//             {'role': 'readWriteAnyDatabase', 'db': 'admin'},
//             {'role': 'userAdminAnyDatabase', 'db': 'admin'}])
//         client = MongoClient(host, port, ssl=True, ssl_certfile=CLIENT_PEM)
//         coll = client.pymongo_test.test
//         self.assertRaises(OperationFailure, coll.count)
//         self.assertTrue(client.admin.authenticate(MONGODB_X509_USERNAME,
//                                                   mechanism='MONGODB-X509'))
//         self.assertTrue(coll.remove())
//         uri = ('mongodb://%s@%s:%d/?authMechanism='
//                'MONGODB-X509' % (quote_plus(MONGODB_X509_USERNAME), host, port))
//         # SSL options aren't supported in the URI...
//         self.assertTrue(MongoClient(uri, ssl=True, ssl_certfile=CLIENT_PEM))
//         # Cleanup
//         client['$external'].command('dropUsersFromDatabase')
//         client['$external'].logout()
}
