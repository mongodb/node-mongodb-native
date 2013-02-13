var Server = require("../server").Server;

// The ping strategy uses pings each server and records the
// elapsed time for the server so it can pick a server based on lowest
// return time for the db command {ping:true}
var PingStrategy = exports.PingStrategy = function(replicaset, secondaryAcceptableLatencyMS) {
  this.replicaset = replicaset;
  this.secondaryAcceptableLatencyMS = secondaryAcceptableLatencyMS;
  this.state = 'disconnected';
  this.pingInterval = 5000;
  // Class instance
  this.Db = require("../../db").Db;
  // Active db connections
  this.dbs = {};
}

// Starts any needed code
PingStrategy.prototype.start = function(callback) {
  // already running?
  if ('connected' == this.state) return;

  this.state = 'connected';

  // Start ping server
  this._pingServer(callback);
}

// Stops and kills any processes running
PingStrategy.prototype.stop = function(callback) {
  // Stop the ping process
  this.state = 'disconnected';

  // optional callback
  callback && callback(null, null);
}

PingStrategy.prototype.checkoutSecondary = function(tags, secondaryCandidates) {
  // Servers are picked based on the lowest ping time and then servers that lower than that + secondaryAcceptableLatencyMS
  // Create a list of candidat servers, containing the primary if available
  var candidateServers = [];

  // If we have not provided a list of candidate servers use the default setup
  if(!Array.isArray(secondaryCandidates)) {
    candidateServers = this.replicaset._state.master != null ? [this.replicaset._state.master] : [];
    // Add all the secondaries
    var keys = Object.keys(this.replicaset._state.secondaries);
    for(var i = 0; i < keys.length; i++) {
      candidateServers.push(this.replicaset._state.secondaries[keys[i]])
    }
  } else {
    candidateServers = secondaryCandidates;
  }

  // Final list of eligable server
  var finalCandidates = [];

  // If we have tags filter by tags
  if(tags != null && typeof tags == 'object') {

    // If we have an array or single tag selection
    var tagObjects = Array.isArray(tags) ? tags : [tags];

    // Iterate over all tags until we find a candidate server
    for(var _i = 0; _i < tagObjects.length; _i++) {

      // Grab a tag object
      var tagObject = tagObjects[_i];

      // Matching keys
      var matchingKeys = Object.keys(tagObject);

      // Remove any that are not tagged correctly
      for(var i = 0; i < candidateServers.length; i++) {
        var server = candidateServers[i];

        // If we have tags match
        if(server.tags != null) {
          var matching = true;

          // Ensure we have all the values
          for(var j = 0; j < matchingKeys.length; j++) {
            if(server.tags[matchingKeys[j]] != tagObject[matchingKeys[j]]) {
              matching = false;
              break;
            }
          }

          // If we have a match add it to the list of matching servers
          if(matching) {
            finalCandidates.push(server);
          }
        }
      }
    }
  } else {
    // Final array candidates
    var finalCandidates = candidateServers;
  }

  // Sort by ping time
  finalCandidates.sort(function(a, b) {
    return a.runtimeStats['pingMs'] > b.runtimeStats['pingMs'];
  });

  if(0 === finalCandidates.length)
    return new Error("No replica set members available for query");

  // find lowest server with a ping time
  var lowest = finalCandidates.filter(function (server) {
    return undefined != server.runtimeStats.pingMs;
  })[0];

  if (!lowest) {
    lowest = finalCandidates[0];
  }

  // convert to integer
  var lowestPing = lowest.runtimeStats.pingMs | 0;

  // determine acceptable latency
  var acceptable = lowestPing + this.secondaryAcceptableLatencyMS;

  // remove any server responding slower than acceptable
  var len = finalCandidates.length;
  while(len--) {
    if(finalCandidates[len].runtimeStats['pingMs'] > acceptable) {
      finalCandidates.splice(len, 1);
    }
  }

  // If no candidates available return an error
  if(finalCandidates.length == 0)
    return new Error("No replica set members available for query");

  // Pick a random acceptable server
  return finalCandidates[Math.round(Math.random(1000000) * (finalCandidates.length - 1))].checkoutReader();
}

PingStrategy.prototype._pingServer = function(callback) {
  var self = this;

  // Ping server function
  var pingFunction = function() {
    if(self.state == 'disconnected') return;

    // Create a list of all servers we can send the ismaster command to
    var allServers = self.replicaset._state.master != null ? [self.replicaset._state.master] : [];

    // Secondary keys
    var keys = Object.keys(self.replicaset._state.secondaries);
    // Add all secondaries
    for(var i = 0; i < keys.length; i++) {
      allServers.push(self.replicaset._state.secondaries[keys[i]]);
    }

    // Number of server entries
    var numberOfEntries = allServers.length;

    // We got keys
    for(var i = 0; i < allServers.length; i++) {

      // We got a server instance
      var server = allServers[i];

      // Create a new server object, avoid using internal connections as they might
      // be in an illegal state
      new function(serverInstance) {
        var _db = self.dbs[serverInstance.host + ":" + serverInstance.port];
        // If we have a db
        if(_db != null) {
          // Startup time of the command
          var startTime = Date.now();

          // Execute ping command in own scope
          var _ping = function(__db, __serverInstance) {
            // Execute ping on this connection
            __db.executeDbCommand({ping:1}, {failFast:true}, function(err) {
              if(err) {
                delete self.dbs[__db.serverConfig.host + ":" + __db.serverConfig.port];
                __db.close();
                return done();
              }

              if(null != __serverInstance.runtimeStats && __serverInstance.isConnected()) {
                __serverInstance.runtimeStats['pingMs'] = Date.now() - startTime;
              }

              done();
            });            
          };
          // Ping
          _ping(_db, serverInstance);
        } else {
          // Create a new master connection
          var _server = new Server(serverInstance.host, serverInstance.port, {
            auto_reconnect: false,
            returnIsMasterResults: true,
            slaveOk: true,
            poolSize: 1,
            socketOptions: { connectTimeoutMS: self.replicaset._connectTimeoutMS },
            ssl: self.replicaset.ssl,
            sslValidate: self.replicaset.sslValidate,
            sslCA: self.replicaset.sslCA,
            sslCert: self.replicaset.sslCert,
            sslKey: self.replicaset.sslKey,
            sslPass: self.replicaset.sslPass
          });

          // Create Db instance        
          var _db = new self.Db(self.replicaset.db.databaseName, _server, { safe: true });
          _db.on("close", function() {
            delete self.dbs[this.serverConfig.host + ":" + this.serverConfig.port];
          })

          var _ping = function(__db, __serverInstance) {
            __db.open(function(err, db) {              
              if(err) {
                delete self.dbs[__db.serverConfig.host + ":" + __db.serverConfig.port];
                __db.close();
                return done();
              }

              // Save instance
              self.dbs[__db.serverConfig.host + ":" + __db.serverConfig.port] = __db;

              // Startup time of the command
              var startTime = Date.now();

              // Execute ping on this connection
              __db.executeDbCommand({ping:1}, {failFast:true}, function(err) {
                if(err) {
                  delete self.dbs[__db.serverConfig.host + ":" + __db.serverConfig.port];
                  __db.close();
                  return done();
                }

                if(null != __serverInstance.runtimeStats && __serverInstance.isConnected()) {
                  __serverInstance.runtimeStats['pingMs'] = Date.now() - startTime;
                }

                done();
              });
            });            
          };

          _ping(_db, serverInstance);
        }

        function done() {
          // Adjust the number of checks
          numberOfEntries--;

          // If we are done with all results coming back trigger ping again
          if(0 === numberOfEntries && 'connected' == self.state) {
            setTimeout(pingFunction, self.pingInterval);
          }
        }
      }(server);
    }
  }

  // Start pingFunction
  // setTimeout(pingFunction, 1000);
  pingFunction();

  callback && callback(null);
}
