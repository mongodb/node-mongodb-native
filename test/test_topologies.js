// MongoDB Topology Manager
var ServerManager = require('mongodb-topology-manager').Server,
  ReplSetManager = require('mongodb-topology-manager').ReplSet,
  ShardingManager = require('mongodb-topology-manager').Sharded;

var P = global.Promise || require('es6-promise'),
  f = require('util').format;

var Sharded = function() {
  this.topology = new ShardingManager({
    mongod: 'mongod',
    mongos: 'mongos'
  });
}

Sharded.prototype.start = function(callback) {
  var self = this;

  return new P(function(resolve, reject) {
    // Add one shard
    self.topology.addShard([{
      options: {
        bind_ip: 'localhost', port: 31000, dbpath: f('%s/../db/31000', __dirname)
      }
    }, {
      options: {
        bind_ip: 'localhost', port: 31001, dbpath: f('%s/../db/31001', __dirname)
      }
    }, {
      // Type of node
      arbiter: true,
      // mongod process options
      options: {
        bind_ip: 'localhost', port: 31002, dbpath: f('%s/../db/31002', __dirname)
      }
    }], {
      replSet: 'rs1'
    }).then(function() {
      // Add one shard
      self.topology.addShard([{
        options: {
          bind_ip: 'localhost', port: 31010, dbpath: f('%s/../db/31010', __dirname)
        }
      }, {
        options: {
          bind_ip: 'localhost', port: 31011, dbpath: f('%s/../db/31011', __dirname)
        }
      }, {
        // Type of node
        arbiter: true,
        // mongod process options
        options: {
          bind_ip: 'localhost', port: 31012, dbpath: f('%s/../db/31012', __dirname)
        }
      }], {
        replSet: 'rs2'
      }).then(function() {
        // Add configuration servers
        self.topology.addConfigurationServers([{
          options: {
            bind_ip: 'localhost', port: 35000, dbpath: f('%s/../db/35000', __dirname)
          }
        }, {
          options: {
            bind_ip: 'localhost', port: 35001, dbpath: f('%s/../db/35001', __dirname)
          }
        }, {
          options: {
            bind_ip: 'localhost', port: 35002, dbpath: f('%s/../db/35002', __dirname)
          }
        }], {
          replSet: 'rs3'
        }).then(function() {
          // Add proxies
          self.topology.addProxies([{
            bind_ip: 'localhost', port: 51000, configdb: 'localhost:35000,localhost:35001,localhost:35002'
          }, {
            bind_ip: 'localhost', port: 51001, configdb: 'localhost:35000,localhost:35001,localhost:35002'
          }], {
            binary: 'mongos'
          }).then(function() {
            self.topology.start().then(function() {
              resolve();
            }).catch(reject);
          }).catch(reject);
        }).catch(reject);
      }).catch(reject);
    }).catch(reject);
  });
}

Sharded.prototype.stop = function(callback) {
  return this.topology.stop();
}

Sharded.prototype.purge = function() {
  return this.topology.purge();
}

Sharded.prototype.proxies = function() {
  return this.topology.proxies.slice(0);
}

Sharded.prototype.restart = function(callback) {
  return this.topology.restart();
}

module.exports = {
  Sharded: Sharded
}
