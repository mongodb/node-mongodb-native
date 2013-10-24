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

  // Read the cert and key
  var cert = fs.readFileSync(__dirname + "/certificates/x509/client.pem");
  var key = fs.readFileSync(__dirname + "/certificates/x509/client.pem");

  // User name
  var userName = "CN=client,OU=kerneluser,O=10Gen,L=New York City,ST=New York,C=US";
  
  // Start server
  serverManager = new ServerManager({
      auth:true
    , purgedirectories:true
    , journal:true
    , ssl:true
    , ssl_ca: '../test/tests/ssl/certificates/x509/ca.pem'
    , ssl_crl: '../test/tests/ssl/certificates/x509/crl.pem'
    , ssl_server_pem: "../test/tests/ssl/certificates/x509/server.pem"
    , ssl_weak_certificate_validation: true
    // EnsureUp options
    , host: 'server'
  });

  serverManager.start(true, function() {
    // Connect and validate the server certificate
    MongoClient.connect("mongodb://server:27017/test?ssl=true&maxPoolSize=1", {
      server: {
          sslKey:key
        , sslCert:cert
      }
    }, function(err, db) {
      test.equal(null, err);
      test.ok(db != null);

      // Execute build info
      db.command({buildInfo:1}, function(err, result) {
        test.equal(null, err);
        var version = parseInt(result.versionArray.slice(0, 3).join(""), 10);
        if(version < 253) {
          db.close();
          return test.done();
        }

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
                sslKey:key
              , sslCert:cert
            }
          }, function(err, db) {
            test.equal(null, err);
            test.ok(db != null);

            db.close();
            serverManager.killAll();
            test.done();
          });
        });
      });
    });
  });
}
