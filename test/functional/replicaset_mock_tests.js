"use strict"

exports['Should correctly print warning when non mongos proxy passed in seed list'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    },
    ignore: { travis:true }
  },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      ObjectId = configuration.require.ObjectId,
      ReadPreference = configuration.require.ReadPreference,
      Logger = configuration.require.Logger,
      Long = configuration.require.Long,
      Code = configuration.require.Code,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var mongos1 = null;
    var mongos2 = null;
    var running = true;
    // Current index for the ismaster
    var currentStep = 0;
    // Primary stop responding
    var stopRespondingPrimary = false;
    var port = null;

    // Extend the object
    var extend = function(template, fields) {
      for(var name in template) fields[name] = template[name];
      return fields;
    }

    // Default message fields
    var defaultFields = {
      "ismaster" : true,
      "msg" : "isdbgrid",
      "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000,
      "localTime" : new Date(),
      "maxWireVersion" : 3,
      "minWireVersion" : 0,
      "ok" : 1
    }

    // Default message fields
    var defaultRSFields = {
      "setName": "rs", "setVersion": 1, "electionId": new ObjectId(),
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 4,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
    }

    // Primary server states
    var serverIsMaster = [extend(defaultFields, {}), extend(defaultRSFields, {})];

    // Boot the mock
    co(function*() {
      mongos1 = yield mockupdb.createServer(52000, 'localhost');
      mongos2 = yield mockupdb.createServer(52001, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc.insert) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      });

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos2.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[1]);
          } else if(doc.insert) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      });

      var logger = Logger.currentLogger();
      Logger.setCurrentLogger(function(msg, state) {
        test.equal('warn', state.type);
        test.equal('expected mongos proxy, but found replicaset member mongod for server localhost:52001', state.message);
      });

      MongoClient.connect('mongodb://localhost:52000,localhost:52001/test', function(err, db) {
        Logger.setCurrentLogger(logger);
        test.equal(null, err);

        running = false;
        db.close();
        mongos1.destroy();
        mongos2.destroy();

        setTimeout(function(){
          test.done();
        }, 200);
      });
    });
  }
}

exports['Should correctly print warning and error when no mongos proxies in seed list'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    },
    ignore: { travis:true }
  },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      ObjectId = configuration.require.ObjectId,
      ReadPreference = configuration.require.ReadPreference,
      Logger = configuration.require.Logger,
      Long = configuration.require.Long,
      Code = configuration.require.Code,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var mongos1 = null;
    var mongos2 = null;
    var running = true;
    // Current index for the ismaster
    var currentStep = 0;
    // Primary stop responding
    var stopRespondingPrimary = false;
    var port = null;

    // Extend the object
    var extend = function(template, fields) {
      for(var name in template) fields[name] = template[name];
      return fields;
    }

    // Default message fields
    var defaultRSFields = {
      "setName": "rs", "setVersion": 1, "electionId": new ObjectId(),
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 4,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
    }

    // Primary server states
    var serverIsMaster = [extend(defaultRSFields, {}), extend(defaultRSFields, {})];

    // Boot the mock
    co(function*() {
      mongos1 = yield mockupdb.createServer(52002, 'localhost');
      mongos2 = yield mockupdb.createServer(52003, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc.insert) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      });

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos2.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[1]);
          } else if(doc.insert) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      });

      var warnings = [];

      var logger = Logger.currentLogger();
      Logger.setCurrentLogger(function(msg, state) {
        test.equal('warn', state.type);
        warnings.push(state);
      });

      MongoClient.connect('mongodb://localhost:52002,localhost:52003/test', function(err, db) {
        Logger.setCurrentLogger(logger);

        // Assert all warnings
        test.equal('expected mongos proxy, but found replicaset member mongod for server localhost:52002', warnings[0].message);
        test.equal('expected mongos proxy, but found replicaset member mongod for server localhost:52003', warnings[1].message);
        test.equal('no mongos proxies found in seed list, did you mean to connect to a replicaset', warnings[2].message);
        test.equal('seed list contains no mongos proxies, replicaset connections requires the parameter replicaSet to be supplied in the URI or options object, mongodb://server:port/db?replicaSet=name', warnings[3].message);
        // Assert error
        test.equal('seed list contains no mongos proxies, replicaset connections requires the parameter replicaSet to be supplied in the URI or options object, mongodb://server:port/db?replicaSet=name', err.message);

        running = false;
        mongos1.destroy();
        mongos2.destroy();
        setTimeout(function(){
          test.done();
        }, 200);
      });
    });
  }
}

exports['Should correctly set socketTimeoutMS and connectTimeoutMS for mongos'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      ObjectId = configuration.require.ObjectId,
      ReadPreference = configuration.require.ReadPreference,
      Long = configuration.require.Long,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var mongos1 = null;
    var mongos2 = null;
    var running = true;

    // Extend the object
    var extend = function(template, fields) {
      for(var name in template) fields[name] = template[name];
      return fields;
    }

    // Default message fields
    var defaultFields = {
      "ismaster" : true,
      "msg" : "isdbgrid",
      "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000,
      "localTime" : new Date(),
      "maxWireVersion" : 5,
      "minWireVersion" : 0,
      "ok" : 1
    }

    // Primary server states
    var serverIsMaster = [extend(defaultFields, {})];
    // Received command on server
    var command = null;
    // Boot the mock
    co(function*() {
      mongos1 = yield mockupdb.createServer(12004, 'localhost');
      mongos2 = yield mockupdb.createServer(12005, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          }
        }
      });

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos2.receive();

          // Get the document
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          }
        }
      });

      MongoClient.connect('mongodb://localhost:12004,localhost:12005/test?socketTimeoutMS=120000&connectTimeoutMS=15000', function(err, db) {
        test.equal(null, err);
        test.equal(15000, db.serverConfig.s.mongos.s.options.connectionTimeout);
        test.equal(120000, db.serverConfig.s.mongos.s.options.socketTimeout);

        db.close();
        mongos1.destroy();
        mongos2.destroy();
        running = false;

        setTimeout(function(){
          test.done();
        }, 200);
      });
    });
  }
}
