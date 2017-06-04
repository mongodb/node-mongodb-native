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

exports['Successfully pass through collation to findAndModify command'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      co = require('co'),
      Long = configuration.require.Long,
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 5, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];
    var commandResult = null;

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.listCollections) {
            request.reply({ok:1, cursor: {
              id: Long.fromNumber(0), ns: 'test.cmd$.listCollections', firstBatch: []
            }});
          } else if(doc.create) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.database);

        // Simple findAndModify command returning the new document
        db.createCollection('test', {viewOn: 'users', pipeline: [{$match: {}}]}, function(err, r) {
          test.equal(null, err);
          test.deepEqual({ create: 'test', viewOn: 'users', pipeline: [ { '$match': {} } ] }, commandResult)

          singleServer.destroy();
          running = false;

          client.close();
          test.done();
        });
      });
    });
  }
}
