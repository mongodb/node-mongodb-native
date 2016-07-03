exports['Should correctly set query and readpreference field on wire protocol for 3.2'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos,
      ObjectId = configuration.require.BSON.ObjectId,
      Long = configuration.require.BSON.Long,
      ReadPreference = configuration.require.ReadPreference,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var mongos1 = null;
    var mongos2 = null;
    var running = true;
    // Current index for the ismaster
    var currentStep = 0;
    // Primary stop responding
    var stopRespondingPrimary = false;

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
      mongos1 = yield mockupdb.createServer(52000, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc['$query'] && doc['$readPreference']) {
            command = doc;
            request.reply({
              "waitedMS" : Long.ZERO,
              "cursor" : {
                "id" : Long.ZERO,
                "ns" : "test.t",
                "firstBatch" : [ ]
              },
              "ok" : 1
            });
          }
        }
      });

      // Start dropping the packets
      setTimeout(function() {
        stopRespondingPrimary = true;
        currentIsMasterState = 1;
      }, 5000);
    });

    // Attempt to connect
    var server = new Mongos([
        { host: 'localhost', port: 52000 }
      ], {
      connectionTimeout: 3000,
      socketTimeout: 5000,
      haInterval: 1000,
      size: 1
    });

    // Add event listeners
    server.once('fullsetup', function() {
      // console.log("------------------------- 0")
      // Execute find
      var cursor = server.cursor('test.test', {
          find: 'test'
        , query: {}
        , batchSize: 2
        , readPreference: ReadPreference.secondary
      });

      // console.log("------------------------- 1")
      // Execute next
      cursor.next(function(err, d) {
        // console.log("------------------------- 2")
        // console.dir(err)
        test.equal(null, err);
        test.equal(null, d);
        test.ok(command['$query']);
        test.ok(command['$readPreference']);
        test.equal('secondary', command['$readPreference'].mode);

        server.destroy();
        mongos1.destroy();
        running = false;
        test.done();
      });
    });

    server.on('error', function(){});
    server.connect();
  }
}

exports['Should correctly set query and near readpreference field on wire protocol for 3.2'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos,
      ObjectId = configuration.require.BSON.ObjectId,
      Long = configuration.require.BSON.Long,
      ReadPreference = configuration.require.ReadPreference,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var mongos1 = null;
    var mongos2 = null;
    var running = true;
    // Current index for the ismaster
    var currentStep = 0;
    // Primary stop responding
    var stopRespondingPrimary = false;

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
      mongos1 = yield mockupdb.createServer(52000, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc['$query'] && doc['$readPreference']) {
            command = doc;
            request.reply({
              "waitedMS" : Long.ZERO,
              "cursor" : {
                "id" : Long.ZERO,
                "ns" : "test.t",
                "firstBatch" : [ ]
              },
              "ok" : 1
            });
          }
        }
      });

      // Start dropping the packets
      setTimeout(function() {
        stopRespondingPrimary = true;
        currentIsMasterState = 1;
      }, 5000);
    });

    // Attempt to connect
    var server = new Mongos([
        { host: 'localhost', port: 52000 }
      ], {
      connectionTimeout: 3000,
      socketTimeout: 5000,
      haInterval: 1000,
      size: 1
    });

    // Add event listeners
    server.once('fullsetup', function() {
      // console.log("------------------------- 0")
      // Execute find
      var cursor = server.cursor('test.test', {
          find: 'test'
        , query: {}
        , batchSize: 2
        , readPreference: new ReadPreference('nearest', [{db:'sf'}])
      });

      // console.log("------------------------- 1")
      // Execute next
      cursor.next(function(err, d) {
        // console.log("------------------------- 2")
        // console.dir(err)
        test.equal(null, err);
        test.equal(null, d);
        test.ok(command['$query']);
        test.ok(command['$readPreference']);
        test.equal('nearest', command['$readPreference'].mode);
        test.deepEqual([{db:'sf'}], command['$readPreference'].tags);

        server.destroy();
        mongos1.destroy();
        running = false;
        test.done();
      });
    });

    server.on('error', function(){});
    server.connect();
  }
}

exports['Should correctly set query and readpreference field on wire protocol for 2.6'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos,
      ObjectId = configuration.require.BSON.ObjectId,
      Long = configuration.require.BSON.Long,
      ReadPreference = configuration.require.ReadPreference,
      co = require('co'),
      mockupdb = require('../../../mock');

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
      "maxWireVersion" : 3,
      "minWireVersion" : 0,
      "ok" : 1
    }

    // Primary server states
    var serverIsMaster = [extend(defaultFields, {})];
    // Received command on server
    var command = null;
    // Boot the mock
    co(function*() {
      mongos1 = yield mockupdb.createServer(52000, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc['$query'] && doc['$readPreference']) {
            command = doc;
            request.reply([]);
          }
        }
      });
    });

    // console.log("----------------------- -3")
    // Attempt to connect
    var server = new Mongos([
        { host: 'localhost', port: 52000 }
      ], {
      connectionTimeout: 3000,
      socketTimeout: 5000,
      haInterval: 1000,
      size: 1
    });

    // console.log("----------------------- -2")
    // Add event listeners
    server.once('connect', function() {
      // Execute find
      var cursor = server.cursor('test.test', {
          find: 'test'
        , query: {}
        , batchSize: 2
        , readPreference: ReadPreference.secondary
      });
      // console.log("----------------------- -1")

      // Execute next
      cursor.next(function(err, d) {
        // console.log("----------------------- 0")
        test.equal(null, err);
        // console.log("----------------------- 1")
        test.equal(null, d);
        // console.log("----------------------- 2")
        test.ok(command['$query']);
        // console.log("----------------------- 3")
        test.ok(command['$readPreference']);
        // console.log("----------------------- 4")
        test.equal('secondary', command['$readPreference'].mode);
        // console.log("----------------------- 5")

        server.destroy();
        mongos1.destroy();
        running = false;
        test.done();
      });
    });

    server.on('error', function(){});
    server.connect();
  }
}

exports['Should correctly set query and readpreference field on wire protocol for 2.4'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos,
      ObjectId = configuration.require.BSON.ObjectId,
      Long = configuration.require.BSON.Long,
      ReadPreference = configuration.require.ReadPreference,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var mongos1 = null;
    var mongos2 = null;
    var running = true;
    // Current index for the ismaster
    var currentStep = 0;
    // Primary stop responding
    var stopRespondingPrimary = false;

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
      "ok" : 1
    }

    // Primary server states
    var serverIsMaster = [extend(defaultFields, {})];
    // Received command on server
    var command = null;
    // Boot the mock
    co(function*() {
      mongos1 = yield mockupdb.createServer(52000, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc['$query'] && doc['$readPreference']) {
            command = doc;
            request.reply([]);
          }
        }
      });

      // Start dropping the packets
      setTimeout(function() {
        stopRespondingPrimary = true;
        currentIsMasterState = 1;
      }, 5000);
    });

    // Attempt to connect
    var server = new Mongos([
        { host: 'localhost', port: 52000 }
      ], {
      connectionTimeout: 3000,
      socketTimeout: 5000,
      haInterval: 1000,
      size: 1
    });

    // Add event listeners
    server.once('fullsetup', function() {
      // Execute find
      var cursor = server.cursor('test.test', {
          find: 'test'
        , query: {}
        , batchSize: 2
        , readPreference: ReadPreference.secondary
      });

      // Execute next
      cursor.next(function(err, d) {
        // console.log("----------------------- 0")
        test.equal(null, err);
        // console.log("----------------------- 1")
        test.equal(null, d);
        // console.log("----------------------- 2")
        test.ok(command['$query']);
        // console.log("----------------------- 3")
        test.ok(command['$readPreference']);
        // console.log("----------------------- 4")
        test.equal('secondary', command['$readPreference'].mode);
        // console.log("----------------------- 5")

        server.destroy();
        mongos1.destroy();
        running = false;
        test.done();
      });
    });

    server.on('error', function(){});
    server.connect();
  }
}
