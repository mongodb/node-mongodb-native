var fs = require('fs');

/**
 * @ignore
 */
exports.shouldCorrectlyValidateServerCertificate = function(configuration, test) {
  var ServerManager = require('../../tools/server_manager').ServerManager
    , MongoClient = configuration.getMongoPackage().MongoClient;

  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];

  var userName = "CN=client,OU=kerneluser,O=10Gen,L=New York City,ST=New York,C=US";
  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];

  // Start server
  serverManager = new ServerManager({
      auth:true
    , purgedirectories:true
    , journal:true
    , ssl:true
	  , ssl_ca: '../test/tests/ssl/certificates/ca.pem'
    , ssl_crl: '../test/tests/ssl/certificates/crl.pem'
    , ssl_server_pem: "../test/tests/ssl/certificates/server.pem"
    // EnsureUp options
    , host: 'server'
    , sslCA:ca
  });

  serverManager.start(true, function() {
    // Connect and validate the server certificate
    MongoClient.connect("mongodb://server:27017/test?ssl=true&maxPoolSize=1", {
      server: {
          sslValidate:true
        , sslCA:ca
      }
    }, function(err, db) {
      test.equal(null, err);
      test.ok(db != null);

      db.close();
      serverManager.killAll();
      test.done();
    });
  });
}
