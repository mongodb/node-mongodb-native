/**
 * Mongos constructor provides a connection to a mongos proxy including failover to additional servers
 *
 * Options
 *  - **ha** {Boolean, default:false}, turn on high availability, attempts to reconnect to down proxies
 *  - **haInterval** {Number, default:2000}, time between each replicaset status check.
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
  // Enabled ha
  this.haEnabled = this.options['ha'] == null ? false : this.options['ha'];
  // How often are we checking for new servers in the replicaset
  this.mongosStatusCheckInterval = this.options['haInterval'] == null ? 2000 : this.options['haInterval'];

	// Save all the server connections
	this.servers = servers;
	// Servers we need to attempt reconnect with
	this.downServers = [];
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
				// Start ha function if it exists
				if(self.haEnabled) {
					// Setup the ha process
					self._replicasetTimeoutId = setTimeout(self.mongosCheckFunction, self.mongosStatusCheckInterval);
				}
				
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
			
			// Ensure we don't store the _server twice
			if(self.downServers.indexOf(_server) == -1) {
				// Add the server instances
				self.downServers.push(_server);				
			}
		}
	}

	// Mongo function
	this.mongosCheckFunction = function() {
		// If we have down servers let's attempt a reconnect
		if(self.downServers.length > 0) {
			var numberOfServersLeft = self.downServers.length;
			
			// Attempt to reconnect
			for(var i = 0; i < self.downServers.length; i++) {
				var downServer = self.downServers.pop();
				// Attemp to reconnect
				downServer.connect(self.db, {returnIsMasterResults: true}, function(_server) {
					// Return a function to check for the values
					return function(err, result) {
						// Adjust the number of servers left
						numberOfServersLeft = numberOfServersLeft - 1;
						
						if(err != null) {
							self.downServers.push(_server);
						} else {
							// Add server event handlers
							_server.on("close", errorOrCloseHandler(_server));
							_server.on("error", errorOrCloseHandler(_server));
						}
						
						if(numberOfServersLeft <= 0) {
							// Perfom another ha
							self._replicasetTimeoutId = setTimeout(self.mongosCheckFunction, self.mongosStatusCheckInterval);
						}
					}
				}(downServer));
			}
		} else {
			// Perfom another ha
			self._replicasetTimeoutId = setTimeout(self.mongosCheckFunction, self.mongosStatusCheckInterval);			
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
 * @ignore
 * Just return the currently picked active connection
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
	// If we have a ha process running kill it
	if(self._replicasetTimeoutId != null) clearTimeout(self._replicasetTimeoutId);	
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
 * @ignore
 * Return the used state
 */
Mongos.prototype._isUsed = function() {  
  return this._used;
}

exports.Mongos = Mongos;