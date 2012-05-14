/**
 * Mongos constructor provides a connection to a mongos proxy including failover to additional servers
 *
 * Options
 *  - **ha** {Boolean, default:false}, turn on high availability.
 *  - **haInterval** {Number, default:2000}, time between each replicaset status check.
 *  - **reconnectWait** {Number, default:1000}, time to wait in miliseconds before attempting reconnect.
 *  - **retries** {Number, default:30}, number of times to attempt a replicaset reconnect.
 *  - **rs_name** {String}, the name of the replicaset to connect to. 
 *  - **readPreference** {String}, the prefered read preference (Server.READ_PRIMARY, Server.READ_SECONDARY, Server.READ_SECONDARY_ONLY).
 *  - **read_secondary** {Boolean, deprecated}, allow reads from secondary.
 *
 * @class Represents a Mongos connection with failover to backup proxies
 * @param {Array} list of mongos server objects
 * @param {Object} [options] additional options for the mongos connection
 */
var Mongos = function Mongos(servers, options) {  
  // Set up basic
  if(!(this instanceof Mongos))
    return new Mongos(servers, options);

	// Throw error on wrong setup
	if(servers == null || !Array.isArray(servers) || servers.length == 0) throw new Error("At least one mongos proxy must be in the array");
  
  // Ensure we have at least an empty options object
  this.options = options == null ? {} : options;
	// Save all the server connections
	this.servers = servers;
  // Unpack options
  this.reconnectWait = this.options["reconnectWait"] != null ? this.options["reconnectWait"] : 1000;
  this.retries = this.options["retries"] != null ? this.options["retries"] : 30;  	
}

/**
 * @ignore
 */
Mongos.prototype.connect = function(db, options, callback) {
  if('function' === typeof options) callback = options, options = {};  
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;
	var self = this;

  // Keep reference to parent
  this.db = db;
  // Set server state to connecting
  this._serverState = 'connecting';
  // Number of total servers that need to initialized (known servers)
  this._numberOfServersLeftToInitialize = this.servers.length;
	// Default to the first proxy server as the first one to use
	this._currentMongos = this.servers[0];
	
	// Connect handler
	var connectHandler = function(_server) {
		return function(err, result) {
			self._numberOfServersLeftToInitialize = self._numberOfServersLeftToInitialize - 1;
			
			if(self._numberOfServersLeftToInitialize == 0) {
				// Set the mongos to connected
				self._serverState = "connected";
				// Callback
				callback(null, null);
			}
		}
	};
	
	// Error handler
	var errorOrCloseHandler = function(_server) {
		return function(err, result) {
			// Create current mongos comparision
			var currentUrl = self._currentMongos.host + ":" + self._currentMongos.port;
			var serverUrl = this.host + ":" + this.port;
			console.log(currentUrl)
			console.log(serverUrl)
			
			// We need to check if the server that closed is the actual current proxy we are using, otherwise
			// just ignore
			if(currentUrl == serverUrl) {
				// Pick the next one on the list if there is one
				for(var i = 0; i < self.servers.length; i++) {
					// Grab the server
					var server = self.servers[i];
					// Generate url for comparision
					var serverUrl = server.host + ":" + server.port;
					// It's not the current one and connected set it as the current db
					if(currentUrl != serverUrl && server.isConnected()) {
						self._currentMongos = server;
						break;
					}
				}
			}
		}
	}
	
	// Connect all the server instances
	for(var i = 0; i < this.servers.length; i++) {
		// Get the connection
		var server = this.servers[i];
		server.mongosInstance = this;
		// Add server event handlers
		server.on("close", errorOrCloseHandler(server));
		server.on("error", errorOrCloseHandler(server));
		// Connect the instance
		server.connect(self.db, {returnIsMasterResults: true}, connectHandler(server));		
	}
}

/**
 * Just return the currently picked active connection
 * @ignore
 */
Mongos.prototype.allServerInstances = function() {
	return [this._currentMongos];
}

/**
 * @ignore
 */
Mongos.prototype.isConnected = function() {
  return this._serverState == "connected";
}

/**
 * @ignore
 */
Mongos.prototype.checkoutWriter = function(read) {
	return this._currentMongos.checkoutWriter();
}

/**
 * @ignore
 */
Mongos.prototype.checkoutReader = function() {
	return this._currentMongos.checkoutReader();
}

/**
 * @ignore
 */
Mongos.prototype.close = function(callback) {
  var self = this;  
  // Set server status as disconnected
  this._serverState = 'disconnected';  
	// Number of connections to close
	var numberOfConnectionsToClose = self.servers.length;
	// Close all proxy connections
	for(var i = 0; i < self.servers.length; i++) {
		self.servers[i].close(function(err, result) {
			numberOfConnectionsToClose = numberOfConnectionsToClose - 1;
			// Callback if we have one defined
			if(numberOfConnectionsToClose == 0 && typeof callback == 'function') {
				callback(null);
			}
		});
	}
}

/**
 * Return the used state
 * @ignore
 */
Mongos.prototype._isUsed = function() {  
  return this._used;
}

exports.Mongos = Mongos;