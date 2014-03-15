var fs = require('fs');
var RS;

var setUp = function(configuration, options, callback) {
  var ReplicaSetManager = require('../../tools/replica_set_manager').ReplicaSetManager
    , Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , MongoClient = configuration.getMongoPackage().MongoClient;

  var cert = fs.readFileSync(__dirname + "/certificates/client.pem");
  if(typeof options == 'function') {
    callback = options;
    options = null;
  }

  var repl_options = {retries:120, 
    host: "server",
    ssl:true,
    ssl_ca: '../test/tests/ssl/certificates/ca.pem',
    ssl_crl: '../test/tests/ssl/certificates/crl.pem',
    ssl_server_pem: "../test/tests/ssl/certificates/server.pem",
    ssl_client_pem: cert,
    auth:true,

    arbiter_count:0,
    secondary_count:2,
    passive_count:0}

  if(options) {
    repl_options = options;
  }

  RS = new ReplicaSetManager(repl_options);  
  RS.startSet(true, function(err, result) {      
    if(err != null) throw err;
    // Finish setup
    callback();      
  });      
}

/**
 * @ignore
 */
exports['Should correctly receive ping and ha events using ssl'] = function(configuration, test) {
  var ReplicaSetManager = require('../../tools/replica_set_manager').ReplicaSetManager
    , Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , ReplSetServers = configuration.getMongoPackage().ReplSetServers
    , MongoClient = configuration.getMongoPackage().MongoClient;

  setUp(configuration, function() {
    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/certificates/client.pem");
    var key = fs.readFileSync(__dirname + "/certificates/client.pem");

    // Create new 
    var replSet = new ReplSetServers( [ 
        new Server( "server", RS.ports[1], { auto_reconnect: true } ),
        new Server( "server", RS.ports[0], { auto_reconnect: true } ),
      ], 
      {
          rs_name:RS.name
        , ssl:true
        , sslValidate:true
        , sslCA:ca
        , sslKey:key
        , sslCert:cert
      }
    );

    // Connect to the replicaset
    var slaveDb = null;
    var db = new Db('foo', replSet, {w:0});
    db.open(function(err, db) {
      test.equal(null, err);

      var ha_connect = false;
      var ha_ismaster = false;
      var ping_connect = false;
      var ping = false;
      var ping_ismaster = false;
      var items = 0;

      // Listen to the ha and ping events
      db.serverConfig.once("ha_connect", function(err) {
        test.equal(null, err);
        ha_connect = true;
        items = items + 1;
      });

      db.serverConfig.once("ha_ismaster", function(err, result) {
        test.equal(null, err);
        ha_ismaster = true;
        items = items + 1;

        test.ok(ha_connect);
        test.ok(ha_ismaster);
        test.ok(ping_connect);
        test.ok(ping);
        test.ok(ping_ismaster);

        db.close();
        test.done();
      });

      db.serverConfig.once("ping_connect", function(err) {
        test.equal(null, err);
        ping_connect = true;
        items = items + 1;
      });

      db.serverConfig.once("ping", function(err) {
        test.equal(null, err);
        ping = true;
        items = items + 1;
      });

      db.serverConfig.once("ping_ismaster", function(err, result) {
        test.equal(null, err);
        ping_ismaster = true;
        items = items + 1;
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyValidateAndPresentCertificateReplSet = function(configuration, test) {
  var ReplicaSetManager = require('../../tools/replica_set_manager').ReplicaSetManager
    , Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , ReplSetServers = configuration.getMongoPackage().ReplSetServers
    , MongoClient = configuration.getMongoPackage().MongoClient;

  setUp(configuration, function() {
    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/certificates/client.pem");
    var key = fs.readFileSync(__dirname + "/certificates/client.pem");

    // Create new 
    var replSet = new ReplSetServers( [ 
        new Server( "server", RS.ports[1], { auto_reconnect: true } ),
        new Server( "server", RS.ports[0], { auto_reconnect: true } ),
      ], 
      {
          rs_name:RS.name
        , ssl:true
        , sslValidate:true
        , sslCA:ca
        , sslKey:key
        , sslCert:cert
      }
    );

    // Connect to the replicaset
    var slaveDb = null;
    var db = new Db('foo', replSet, {w:0});
    db.open(function(err, db) {
      test.equal(null, err);

      setInterval(function() {
        db.collection('test').count(function() {});
      }, 1000);

      // Create a collection
      db.createCollection('shouldCorrectlyValidateAndPresentCertificateReplSet', function(err, collection) {
        collection.remove({});
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}], {w:1}, function(err, result) {
          collection.find({}).toArray(function(err, items) {
            test.equal(15, items.length);
            db.close();
            test.done();
          })
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldFailDuePresentingWrongCredentialsToServer = function(configuration, test) {
  var ReplicaSetManager = require('../../tools/replica_set_manager').ReplicaSetManager
    , Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , ReplSetServers = configuration.getMongoPackage().ReplSetServers
    , MongoClient = configuration.getMongoPackage().MongoClient;

  setUp(configuration, function() {
    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/certificates/mycert.pem");
    var key = fs.readFileSync(__dirname + "/certificates/mycert.pem");

    // Create new 
    var replSet = new ReplSetServers( [ 
        new Server( "server", RS.ports[1], { auto_reconnect: true } ),
        new Server( "server", RS.ports[0], { auto_reconnect: true } ),
      ], 
      {
          rs_name:RS.name
        , poolSize:5
        , ssl:true
        , sslValidate:true
        , sslCA:ca
        , sslKey:key
        , sslCert:cert
        , sslPass:'10gen'
      }
    );

    // Connect to the replicaset
    var slaveDb = null;
    var db = new Db('foo', replSet, {w:0});
    db.open(function(err, p_db) {
      test.ok(err != null);
      test.equal(p_db, null);
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyConnectToSSLBasedReplicaset = function(configuration, test) {
  var ReplicaSetManager = require('../../tools/replica_set_manager').ReplicaSetManager
    , Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , ReplSetServers = configuration.getMongoPackage().ReplSetServers
    , MongoClient = configuration.getMongoPackage().MongoClient;

  var repl_options = {retries:120, 
    host: "server",
    ssl:true  ,
    ssl_server_pem: "../test/tests/ssl/certificates/server.pem",
    arbiter_count:0,
    secondary_count:2,
    passive_count:0}

  setUp(configuration, repl_options, function() {    
    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];
    // Create new 
    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      ], 
      {
          rs_name:RS.name
        , ssl:true
        , sslValidate:true
        , sslCA:ca
      }
    );
    
    // Connect to the replicaset
    var slaveDb = null;
    var db = new Db('foo', replSet, {w:0});
    db.open(function(err, p_db) {
      test.equal(null, err);
      test.ok(!!p_db);
      p_db.collection('test').find({}, function(error) {
        test.equal(null, error);
        test.done();
        p_db.close();
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldFailToValidateServerSSLCertificate = function(configuration, test) {
  var ReplicaSetManager = require('../../tools/replica_set_manager').ReplicaSetManager
    , Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , ReplSetServers = configuration.getMongoPackage().ReplSetServers
    , MongoClient = configuration.getMongoPackage().MongoClient;

  setUp(configuration, function() {
    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/certificates/mycert.pem")];
    // Create new 
    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      ], 
      {
          rs_name:RS.name
        , ssl:true
        , sslValidate:true
        , sslCA:ca
        , poolSize:5
      }
    );
    
    // Connect to the replicaset
    var slaveDb = null;
    var db = new Db('foo', replSet, {w:0});
    db.open(function(err, p_db) {
      test.ok(err != null);
      test.ok(err instanceof Error);
      test.ok(!p_db);
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports.shouldFailDueToNotPresentingCertificateToServer = function(configuration, test) {
  var ServerManager = require('../../tools/server_manager').ServerManager
    , Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , MongoClient = configuration.getMongoPackage().MongoClient;
  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/certificates/client.pem");
  // Create a db connection
  var db1 = new Db(configuration.db_name, new Server("server", 27017, 
    {   auto_reconnect: false
      , poolSize:1
      , ssl:true
      , sslValidate:true
      , sslCA:ca
      , sslCert:cert
    }), {w:0});
  
  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];

  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/certificates/client.pem");
  var key = fs.readFileSync(__dirname + "/certificates/client.pem");
  
  // Start server
  serverManager = new ServerManager({
      auth:false
    , purgedirectories:true
    , journal:true
    , ssl:true
    , ssl_ca: '../test/tests/ssl/certificates/ca.pem'
    , ssl_crl: '../test/tests/ssl/certificates/crl.pem'    
    , ssl_server_pem: "../test/tests/ssl/certificates/server.pem"
    // EnsureUp options
    , host: 'server'
    , sslValidate:true
    , sslCA:ca
    , sslKey:key
    , sslCert:cert
  });

  serverManager.start(true, function() {
    db1.open(function(err, db) {  
      // console.log(err)
      test.ok(err != null);
      test.ok(!db);
      test.done();      
    })      
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyValidateAndPresentCertificate = function(configuration, test) {
  var ServerManager = require('../../tools/server_manager').ServerManager
    , Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , MongoClient = configuration.getMongoPackage().MongoClient;
  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/certificates/client.pem");
  var key = fs.readFileSync(__dirname + "/certificates/client.pem");
  // Create a db connection
  var db1 = new Db(configuration.db_name, new Server("server", 27017, 
    {   auto_reconnect: false
      , poolSize:1
      , ssl:true
      , sslValidate:true
      , sslCA:ca
      , sslKey:key
      , sslCert:cert
    }), {w:0});
  
  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];
  
  // Start server
  serverManager = new ServerManager({
      auth:false
    , purgedirectories:true
    , journal:true
    , ssl:true
    , ssl_ca: '../test/tests/ssl/certificates/ca.pem'
    , ssl_crl: '../test/tests/ssl/certificates/crl.pem'    
    , ssl_server_pem: "../test/tests/ssl/certificates/server.pem"
    // EnsureUp options
    , host: 'server'
    , sslValidate:true
    , sslCA:ca
    , sslKey:key
    , sslCert:cert
  });

  serverManager.start(true, function() {
    db1.open(function(err, db) {        
      // Create a collection
      db.createCollection('shouldCorrectlyValidateAndPresentCertificate', function(err, collection) {
        collection.remove({});
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}], {w:1}, function(err, result) {
          collection.find({}).toArray(function(err, items) {
            test.equal(15, items.length);
            db.close();
            test.done();
          })
        });
      });        
    })      
  });
}

/**
 * @ignore
 */
exports.shouldFailDuePresentingWrongCredentialsToServer = function(configuration, test) {
  var ServerManager = require('../../tools/server_manager').ServerManager
    , Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , MongoClient = configuration.getMongoPackage().MongoClient;
  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/certificates/smoke.pem");
  var key = fs.readFileSync(__dirname + "/certificates/smoke.pem");

  // Create a db connection
  var db1 = new Db(configuration.db_name, new Server("server", 27017, 
    {   auto_reconnect: false
      , poolSize:1
      , ssl:true
      , sslValidate:true
      , sslCA:ca
      , sslKey:key
      , sslCert:cert
    }), {w:0});
  
  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];

  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/certificates/client.pem");
  var key = fs.readFileSync(__dirname + "/certificates/client.pem");
  
  // Start server
  serverManager = new ServerManager({
      auth:false
    , purgedirectories:true
    , journal:true
    , ssl:true
    , ssl_ca: '../test/tests/ssl/certificates/ca.pem'
    , ssl_crl: '../test/tests/ssl/certificates/crl.pem'    
    , ssl_server_pem: "../test/tests/ssl/certificates/server.pem"
    // EnsureUp options
    , host: 'server'
    , sslValidate:true
    , sslCA:ca
    , sslKey:key
    , sslCert:cert
  });

  serverManager.start(true, function() {
    db1.open(function(err, db) {  
      test.ok(err != null);
      test.ok(!db);
      test.done();      
    })      
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyPresentPasswordProtectedCertificate = function(configuration, test) {
  var ServerManager = require('../../tools/server_manager').ServerManager
    , Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , MongoClient = configuration.getMongoPackage().MongoClient;
  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/certificates/password_protected.pem");
  var key = fs.readFileSync(__dirname + "/certificates/password_protected.pem");
  // Create a db connection
  var db1 = new Db(configuration.db_name, new Server("server", 27017, 
    {   auto_reconnect: false
      , poolSize:1
      , ssl:true
      , sslValidate:true
      , sslCA:ca
      , sslKey:key
      , sslCert:cert
      , sslPass:'qwerty'
    }), {w:0});
  
  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];
  
  // Start server
  serverManager = new ServerManager({
      auth:false
    , purgedirectories:true
    , journal:true
    // Server starting options
    , ssl:true
    , ssl_ca: '../test/tests/ssl/certificates/ca.pem'
    , ssl_crl: '../test/tests/ssl/certificates/crl.pem'    
    , ssl_server_pem: "../test/tests/ssl/certificates/server.pem"
    // EnsureUp options
    , host: 'server'
    , sslValidate:true
    , sslCA:ca
    , sslKey:key
    , sslCert:cert
    , sslPass:'qwerty'    
  });

  serverManager.start(true, function() {
    db1.open(function(err, db) {  
      // Create a collection
      db.createCollection('shouldCorrectlyValidateAndPresentCertificate', function(err, collection) {
        collection.remove({});
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}], {w:1}, function(err, result) {
          collection.find({}).toArray(function(err, items) {
            test.equal(15, items.length);
            db.close();
            test.done();
          })
        });
      });        
    })      
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyValidateServerSSLCertificate = function(configuration, test) {
  var ServerManager = require('../../tools/server_manager').ServerManager
    , Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , MongoClient = configuration.getMongoPackage().MongoClient;
  
  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];
  
  // Create a db connection
  var db1 = new Db(configuration.db_name, new Server("server", 27017, 
    {   auto_reconnect: false
      , poolSize:1
      , ssl:true
      , sslValidate:true
      , sslCA:ca }), {w:0});
  
  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];
  
  // Start server
  serverManager = new ServerManager({
      auth:false
    , purgedirectories:true
    , journal:true
    , ssl:true
    , ssl_server_pem: "../test/tests/ssl/certificates/server.pem"
    })

  serverManager.start(true, function() {
    db1.open(function(err, db) {    
      test.equal(null, err)

      // Create a collection
      db.createCollection('shouldCorrectlyCommunicateUsingSSLSocket', function(err, collection) {
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}], {w:1}, function(err, result) {
          collection.find({}).toArray(function(err, items) {
            test.equal(15, items.length);
            db.close();
            test.done();
          })
        });
      });        
    })      
  });
}

/**
 * @ignore
 */
exports.shouldFailToValidateServerSSLCertificate = function(configuration, test) {
  var ServerManager = require('../../tools/server_manager').ServerManager
    , Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , MongoClient = configuration.getMongoPackage().MongoClient;
  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/certificates/mycert.pem")];
  // Create a db connection
  var db1 = new Db(configuration.db_name, new Server("server", 27017, 
    {   auto_reconnect: false
      , poolSize:1
      , ssl:true
      , sslValidate:true
      , sslCA:ca }), {w:0});
  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];
  
  // Start server
  serverManager = new ServerManager({
      auth:false
    , purgedirectories:true
    , journal:true
    , ssl:true
    , ssl_server_pem: "../test/tests/ssl/certificates/server.pem"
    })
  serverManager.start(true, function() {
    db1.open(function(err, db) {        
      test.ok(err != null);
      test.done();
    })      
  });
}

