var Connection = require('../connection').Connection,
  DbCommand = require('../commands/db_command').DbCommand,
  MongoReply = require('../responses/mongo_reply').MongoReply,
  debug = require('util').debug,
  inspect = require('util').inspect,
  Server = require('./server').Server;

/**
* ReplSetServers constructor provides master-slave functionality
*
* @param serverArr{Array of type Server}
* @return constructor of ServerCluster
*
*/
var ReplSetServers = exports.ReplSetServers = function(servers) {
  // Contains the master server entry
  this.master = null;
  this.target = null;

  if(servers.constructor != Array || servers.length == 0) {
    throw Error("The parameter must be an array of servers and contain at least one server");
  } else if(servers.constructor == Array || servers.length > 0) {
    var count = 0;
    servers.forEach(function(server) {
      if(server instanceof Server) count = count + 1;
    });

    if(count < servers.length) {
      throw Error("All server entries must be of type Server");
    } else {
      this.servers = servers;
    }
  }
  // Setters and getters
  this.__defineGetter__("autoReconnect", function() {
    if(this.target != null) return this.target.autoReconnect;
    if(this.masterConnection != null) return this.masterConnection.autoReconnect;
  });
  this.__defineGetter__("masterConnection", function() {
    // Allow overriding to a specific connection
    if(this.target != null && this.target instanceof Server) {
      return this.target.masterConnection;
    } else {
      var finalServer = null;
      this.servers.forEach(function(server) {
        if(server.master == true && ( server.connection.connection.readyState == "open") ) finalServer = server;
      });
      return finalServer != null ? finalServer.masterConnection : finalServer;
    }
  });
};

ReplSetServers.prototype.setTarget = function(target) {
  this.target = target;
};

ReplSetServers.prototype.connect = function(parent, callback) {
  var replSetSelf = this;
  var serverConnections = this.servers;
  var numberOfConnectedServers = 0; 
  var numberOfErrorServers = 0;
  this.addresses = {};

  var initServer = function(server)  {
    replSetSelf.addresses[ server.host + ':' + server.port ] = 1;
    server.connection = new Connection(server.host, server.port, server.autoReconnect);
    //console.log( 'Connect to ' + server.host + ':' + server.port );
    parent.connections.push(server.connection);

    server.connection.addListener("connect", function() {
      // Create a callback function for a given connection
      var connectCallback = function(err, reply) {
        if(err != null) {
          callback(err, null);          
        } else {
          if(reply.documents[0].ismaster == 1) {
            // Locate the master connection and save it
            parent.masterConnection = server.connection;
            server.master = true;
          } else {
            server.master = false;
          }
          
          if(reply.documents[0].hosts != undefined) {
            var replicas = reply.documents[0].hosts;
            
            for(var i in replicas) {
              if(replicas[i] in replSetSelf.addresses) {                  
                continue;
              } 

              replSetSelf.addresses[ replicas[i] ] = 1;
              var ipAndPort = replicas[i].split(":");
              var newServer = new Server( ipAndPort[0], parseInt( ipAndPort[1]), { auto_reconnect: true}  );
              console.log( 'Added ' + replicas[i] + ' to the replica set' );
              serverConnections.push( newServer );
              initServer( newServer );
            }
          }

          // emit a message saying we got a master and are ready to go and change state to reflect it
          if(++numberOfConnectedServers == serverConnections.length && (parent.state == 'notConnected')) {
            parent.state = 'connected';
            parent.isInitializing  = false;
            return callback(null, parent);
          } 

          if(server.master) {
            //we have the master we are ok, wait for others (if any) to connect too
            parent.state = 'connected'; 
          }            

          if ((numberOfConnectedServers + numberOfErrorServers) == serverConnections.length) { 
            parent.isInitializing  = false;

            if (parent.state == 'connected') {
              return callback( null, parent );
            } else { 
              return callback(new Error('No master available'), null);
            }
          }
        }
      };

      // Create db command and Add the callback to the list of callbacks by the request id (mapping outgoing messages to correct callbacks)
      var db_command = DbCommand.createIsMasterCommand(parent);        
      parent.addListener(db_command.getRequestId().toString(), connectCallback);
      parent.notReplied[db_command.getRequestId().toString()] = this;  

      // Let's send a request to identify the state of the server
      this.send(db_command);
      
      server.connection.addListener("data", function(message) {
        // Parse the data as a reply object
        var reply = new MongoReply(parent, message);
        // Emit error if there is one       
        reply.responseHasError ? parent.emit(reply.responseTo.toString(), reply.documents[0], reply) : parent.emit(reply.responseTo.toString(), null, reply);
        // Remove the listener
        if(parent.notReplied [ reply.responseTo.toString()]) {
         delete parent.notReplied[ reply.responseTo.toString()];
         parent.removeListener(reply.responseTo.toString(), parent.listeners(reply.responseTo.toString())[0]);
        }
      });
    });

    server.connection.addListener("error", function(err) {
      if(parent.isInitializing) {
        //we only have one error, if the rest are ok there is no problem
        numberOfErrorServers++;
        //console.log( server.host + ':' + server.port + ' down!!!'+ err );
        if((numberOfErrorServers + numberOfConnectedServers) == serverConnections.length) {
          parent.isInitializing  = false;
          
          if(parent.state == 'connected') {
            return callback( null, parent);
          } else { 
            return callback(new Error('No master available'), null);
          }
        }
      } else {
        for(var i in parent.notReplied) {
          if(parent.notReplied[i] == this) {
            delete parent.notReplied[i];
            parent.emit(i, null, { documents: [{'$err':'Connection closed'}] });
            parent.removeListener( i, parent.listeners( i )[0]);
          }
        }
      }
    });      

    // Emit timeout and close events so the client using db can figure do proper error handling (emit contains the connection that triggered the event)
    server.connection.addListener("timeout", function() { parent.emit("timeout", replSetSelf); });
    server.connection.addListener("close", function() { parent.emit("close", replSetSelf); });
    // Open the connection
    server.connection.open();
  };

  // Initialize connections
  serverConnections.forEach(initServer);
}
