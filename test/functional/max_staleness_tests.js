"use strict";

// Extend the object
var extend = function(template, fields) {
  var object = {};
  for(var name in template) {
    object[name] = template[name];
  }

  for(var name in fields) {
   object[name] = fields[name];
  }

  return object;
}

exports['Should correctly set maxStalenessSeconds on Mongos query using MongoClient.connect'] = {
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
      mongos1 = yield mockupdb.createServer(62001, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;
          // console.log("================================== doc")
          // console.dir(doc)

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

      MongoClient.connect('mongodb://localhost:62001/test?readPreference=secondary&maxStalenessSeconds=250', function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.database);

        db.collection('test').find({}).toArray(function(err, r) {
          test.equal(null, err);
          test.deepEqual({
            '$query':  { find: 'test', filter: {} },
            '$readPreference': { mode: 'secondary', maxStalenessSeconds: 250 }
          }, command);

          client.close();
          mongos1.destroy();
          running = false;
          test.done();
        });
      });
    });
  }
}

exports['Should correctly set maxStalenessSeconds on Mongos query using db level readPreference'] = {
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
      mongos1 = yield mockupdb.createServer(62002, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;
          // console.log("================================== doc")
          // console.dir(doc)

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

      MongoClient.connect('mongodb://localhost:62002/test', function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.database);

        // Get a db with a new readPreference
        var db1 = client.db('test', {readPreference: new ReadPreference('secondary', {maxStalenessSeconds: 250})})
        db1.collection('test').find({}).toArray(function(err, r) {
          test.equal(null, err);
          test.deepEqual({
            '$query':  { find: 'test', filter: {} },
            '$readPreference': { mode: 'secondary', maxStalenessSeconds: 250 }
          }, command);

          client.close();
          mongos1.destroy();
          running = false;
          test.done();
        });
      });
    });
  }
}

exports['Should correctly set maxStalenessSeconds on Mongos query using collection level readPreference'] = {
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
      mongos1 = yield mockupdb.createServer(62003, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;
          // console.log("================================== doc")
          // console.dir(doc)

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

      MongoClient.connect('mongodb://localhost:62003/test', function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.database);

        // Get a db with a new readPreference
        db.collection('test', {readPreference: new ReadPreference('secondary', {maxStalenessSeconds: 250})}).find({}).toArray(function(err, r) {
          test.equal(null, err);
          test.deepEqual({
            '$query':  { find: 'test', filter: {} },
            '$readPreference': { mode: 'secondary', maxStalenessSeconds: 250 }
          }, command);

          client.close();
          mongos1.destroy();
          running = false;
          test.done();
        });
      });
    });
  }
}

exports['Should correctly set maxStalenessSeconds on Mongos query using cursor level readPreference'] = {
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
      mongos1 = yield mockupdb.createServer(62004, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;
          // console.log("================================== doc")
          // console.dir(doc)

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

      MongoClient.connect('mongodb://localhost:62004/test', function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.database);

        // Get a db with a new readPreference
        db.collection('test').find({}).setReadPreference(new ReadPreference('secondary', {maxStalenessSeconds: 250})).toArray(function(err, r) {
          test.equal(null, err);
          test.deepEqual({
            '$query':  { find: 'test', filter: {} },
            '$readPreference': { mode: 'secondary', maxStalenessSeconds: 250 }
          }, command);

          client.close();
          mongos1.destroy();
          running = false;
          test.done();
        });
      });
    });
  }
}
