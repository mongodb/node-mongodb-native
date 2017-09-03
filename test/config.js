'use strict';
var ConfigurationBase = require('mongodb-test-runner').ConfigurationBase;
var inherits = require('util').inherits;
var f = require('util').format;

var clone = function(obj) {
  var copy = {};
  for (var name in obj) copy[name] = obj[name];
  return copy;
};

var NativeConfiguration = function(options) {
  ConfigurationBase.call(this, options);

  this.type = 'native';
  this.topology = options.topology || this.defaultTopology;
  this.replicasetName = options.replicasetName || 'rs';
};
inherits(NativeConfiguration, ConfigurationBase);

NativeConfiguration.prototype.defaultTopology = function(
  serverHost,
  serverPort,
  serverOpts,
  _mongo
) {
  return new _mongo.Server(serverHost, serverPort, serverOpts || {});
};

NativeConfiguration.prototype.start = function(callback) {
  var self = this;
  if (this.skipStart) return callback();

  var client = this.newClient({}, { host: self.host, port: self.port });
  this.manager
    .purge()
    .then(function() {
      console.log('[purge the directories]');
      return self.manager.start();
    })
    .then(function() {
      console.log('[started the topology]');
      return client.connect();
    })
    .then(function() {
      console.log('[get connection to topology]');
      var db = client.db(self.db);
      return db.dropDatabase();
    })
    .then(function() {
      console.log('[dropped database]');
      return client.close();
    })
    .then(function() {
      callback(null);
    })
    .catch(function(err) {
      callback(err, null);
    });
};

NativeConfiguration.prototype.newClient = function(dbOptions, serverOptions) {
  serverOptions = serverOptions || {};
  // Override implementation
  if (this.options.newDbInstance) {
    return this.options.newDbInstance(dbOptions, serverOptions);
  }

  // Set up the options
  var keys = Object.keys(this.options);
  if (keys.indexOf('sslOnNormalPorts') !== -1) serverOptions.ssl = true;

  // Fall back
  var dbHost = (serverOptions && serverOptions.host) || 'localhost';
  var dbPort = (serverOptions && serverOptions.port) || this.options.port || 27017;

  // Default topology
  var DbTopology = this.mongo.Server;
  // If we have a specific topology
  if (this.options.topology) {
    DbTopology = this.options.topology;
  }

  // Return a new MongoClient instance
  return new this.mongo.MongoClient(
    new DbTopology(dbHost, dbPort, serverOptions, this.mongo),
    dbOptions
  );
};

NativeConfiguration.prototype.url = function(username, password) {
  var url = this.options.url || 'mongodb://%slocalhost:27017/' + this.db;
  // Fall back
  var auth = '';
  if (username && password) {
    auth = f('%s:%s@', username, password);
  }

  return f(url, auth);
};

NativeConfiguration.prototype.writeConcern = function() {
  return clone(this.options.writeConcern || { w: 1 });
};

NativeConfiguration.prototype.writeConcernMax = function() {
  return clone(this.options.writeConcernMax || { w: 1 });
};

module.exports = NativeConfiguration;
