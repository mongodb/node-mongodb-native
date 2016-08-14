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

exports['Successfully handle buffering store execution for primary server'] = {
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
    var primaryServer = null;
    var firstSecondaryServer = null;
    var secondSecondaryServer = null;
    var arbiterServer = null;
    var running = true;
    var currentIsMasterIndex = 0;

    // Election Ids
    var electionIds = [new ObjectId(0), new ObjectId(1)]
    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 4,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
    }

    // Primary server states
    var primary = [extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32000", "primary": "localhost:32001", "tags" : { "loc" : "ny" },
      "electionId": electionIds[1]
    })];

    // Primary server states
    var firstSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32001", "primary": "localhost:32001", "tags" : { "loc" : "ny" },
      "electionId": electionIds[1]
    })];

    // Primary server states
    var secondSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32002", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32002", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32002", "primary": "localhost:32001", "tags" : { "loc" : "ny" },
      "electionId": electionIds[1]
    })];

    // Die
    var die = false;
    var dieSecondary = false;

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      secondSecondaryServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          var doc = request.document;
          // console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&& primary")
          // console.dir(doc)

          if(die) {
            request.connection.destroy();
          } else {
            if(doc.ismaster) {
              request.reply(primary[currentIsMasterIndex]);
            } else if(doc.insert) {
              request.reply({ok:1, n:1});
            } else if(doc.aggregate) {
              request.reply({ok:1, n:1});
            }
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;
          // console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&& secondary 1")
          // console.dir(doc)

          if(die || dieSecondary) {
            request.connection.destroy();
          } else {
            if(doc.ismaster) {
              request.reply(firstSecondary[currentIsMasterIndex]);
            }
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield secondSecondaryServer.receive();
          var doc = request.document;
          // console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&& secondary 2")
          // console.dir(doc)

          if(die || dieSecondary) {
            request.connection.destroy();
          } else {
            if(doc.ismaster) {
              request.reply(secondSecondary[currentIsMasterIndex]);
            }
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      MongoClient.connect('mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs'
        , {
          socketTimeoutMS: 2000, haInterval: 1000
        }, function(err, db) {
          test.equal(null, err);
          var results = [];

          setTimeout(function() {
            die = true;
            dieSecondary = true;

            setTimeout(function() {

              db.collection('test').insertOne({a:1}, function(err) {
                results.push('insertOne');
              });

              db.command({count:'test', query: {}}
                , {readPreference: new ReadPreference(ReadPreference.SECONDARY)}, function(err) {
                  results.push('count');
              });

              db.collection('test').aggregate([{$match:{}}]).toArray(function(err) {
                results.push('aggregate');
              });

              db.collection('test')
                .find({})
                .setReadPreference(new ReadPreference(ReadPreference.SECONDARY))
                .toArray(function(err, docs) {
                  results.push('find');
                });

              setTimeout(function() {
                die = false;

                setTimeout(function() {
                  test.deepEqual(['insertOne', 'aggregate'].sort(), results.sort());

                  running = false;
                  db.close();
                  test.deepEqual(['insertOne', 'aggregate', 'count', 'find'].sort(), results.sort());

                  primaryServer.destroy();
                  firstSecondaryServer.destroy();
                  secondSecondaryServer.destroy();
                  test.done();
                }, 1000);
              }, 1000);
            }, 3000);
          }, 1000);
      });
    });
  }
}

exports['Successfully handle buffering store execution for secondary server'] = {
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
    var primaryServer = null;
    var firstSecondaryServer = null;
    var secondSecondaryServer = null;
    var arbiterServer = null;
    var running = true;
    var currentIsMasterIndex = 0;

    // Election Ids
    var electionIds = [new ObjectId(0), new ObjectId(1)]
    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 4,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
    }

    // Primary server states
    var primary = [extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32000", "primary": "localhost:32001", "tags" : { "loc" : "ny" },
      "electionId": electionIds[1]
    })];

    // Primary server states
    var firstSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32001", "primary": "localhost:32001", "tags" : { "loc" : "ny" },
      "electionId": electionIds[1]
    })];

    // Primary server states
    var secondSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32002", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32002", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32002", "primary": "localhost:32001", "tags" : { "loc" : "ny" },
      "electionId": electionIds[1]
    })];

    // Die
    var die = false;
    var diePrimary = false;

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      secondSecondaryServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          var doc = request.document;

          if(die || diePrimary) {
            request.connection.destroy();
          } else {
            // console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&& primary")
            // console.dir(doc)

            if(doc.ismaster) {
              request.reply(primary[currentIsMasterIndex]);
            }
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(die) {
            request.connection.destroy();
          } else {
            // console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&& secondary 1")
            // console.dir(doc)

            if(doc.ismaster) {
              request.reply(firstSecondary[currentIsMasterIndex]);
            } else if(doc.count) {
              request.reply({ok:1, n: 10});
            } else if(doc.find) {
              request.reply({ok:1, n: 10});
            }
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield secondSecondaryServer.receive();
          var doc = request.document;

          if(die) {
            request.connection.destroy();
          } else {
            // console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&& secondary 2")
            // console.dir(doc)

            if(doc.ismaster) {
              request.reply(secondSecondary[currentIsMasterIndex]);
            } else if(doc.count) {
              request.reply({ok:1, n: 10});
            } else if(doc.find) {
              request.reply({ok:1, n: 10});
            }
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      MongoClient.connect('mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs'
        , {
          socketTimeoutMS: 2000, haInterval: 1000
        }, function(err, db) {
          test.equal(null, err);

          // console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ 0")
          setTimeout(function() {
            die = true;
            diePrimary = true;

            // console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ 1")
            setTimeout(function() {
              var results = [];

              // console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ 2")
              db.collection('test').insertOne({a:1}, function(err) {
                results.push('insertOne');
                //
                // console.log("------------------------ insertOne");
                // console.dir(err)
                // results.push(err);
              });

              db.command({count:'test', query: {}}
                , {readPreference: new ReadPreference(ReadPreference.SECONDARY)}, function(err) {
                  results.push('count');
                  // console.log("------------------------ count command");
                  // console.dir(err)
                  // results.push(err);
              });

              db.collection('test').aggregate([{$match:{}}]).toArray(function(err) {
                results.push('aggregate');
                // console.log("------------------------ aggregate");
                // console.dir(err)
                // results.push(err);
              });

              db.collection('test')
                .find({})
                .setReadPreference(new ReadPreference(ReadPreference.SECONDARY))
                .toArray(function(err, docs) {
                  results.push('find');
                  // console.log("------------------------ query");
                  // console.dir(err)
                  // results.push(err);
                });

              setTimeout(function() {
                // console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ 3")
                die = false;
                // var results1 = results;
                // results = [];

                setTimeout(function() {
                  // console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ 4")
                  // console.dir(results)
                  test.deepEqual(['count', 'find'].sort(), results.sort());

                  running = false;
                  db.close();

                  test.deepEqual(['count', 'find', 'insertOne', 'aggregate'].sort(), results.sort());

                  primaryServer.destroy();
                  firstSecondaryServer.destroy();
                  secondSecondaryServer.destroy();
                  test.done();
                }, 1500);
              }, 1000);
            }, 3000);
          }, 1000);
      });
    });
  }
}
