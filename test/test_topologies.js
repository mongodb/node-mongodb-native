// MongoDB Topology Manager
var ServerManager = require('mongodb-topology-manager').Server,
  ReplSetManager = require('mongodb-topology-manager').ReplSet,
  ShardingManager = require('mongodb-topology-manager').Sharded;

var P = global.Promise || require('es6-promise'),
  f = require('util').format;

var Sharded = function(options, clientOptions) {
  this.topology = new ShardingManager({
    mongod: 'mongod',
    mongos: 'mongos'
  });

  // Additional options needed
  this.options = options || {};
  this.clientOptions = clientOptions || {};
}

Sharded.prototype.start = function(callback) {
  var self = this;

  return new P(function(resolve, reject) {
    // First set of nodes
    var nodes1 = [{
      tags: {"loc":"ny"},
      options: {
        bind_ip: 'localhost', port: 31010, dbpath: f('%s/../db/31000', __dirname)
      }
    }, {
      tags: {"loc":"sf"},
      options: {
        bind_ip: 'localhost', port: 31011, dbpath: f('%s/../db/31001', __dirname)
      }
    }, {
      // Type of node
      arbiter: true,
      // mongod process options
      options: {
        bind_ip: 'localhost', port: 31012, dbpath: f('%s/../db/31002', __dirname)
      }
    }];

    // Map any additional
    nodes1 = nodes1.map(function(x) {
      if(self.options && self.options.shard) {
        for(var name in self.options.shard) {
          x.options[name] = self.options.shard[name];
        }
      }

      return x;
    });

    // Add one shard
    self.topology.addShard(nodes1, {
      replSet: 'rs1'
    }).then(function() {
      var nodes2 = [{
        tags: {"loc":"ny"},
        options: {
          bind_ip: 'localhost', port: 31020, dbpath: f('%s/../db/31010', __dirname)
        }
      }, {
        tags: {"loc":"sf"},
        options: {
          bind_ip: 'localhost', port: 31021, dbpath: f('%s/../db/31011', __dirname)
        }
      }, {
        // Type of node
        arbiter: true,
        // mongod process options
        options: {
          bind_ip: 'localhost', port: 31022, dbpath: f('%s/../db/31012', __dirname)
        }
      }];

      // Map any additional
      nodes2 = nodes2.map(function(x) {
        if(self.options && self.options.shard) {
          for(var name in self.options.shard) {
            x.options[name] = self.options.shard[name];
          }
        }

        return x;
      });

      // Add one shard
      self.topology.addShard(nodes2, {
        replSet: 'rs2'
      }).then(function() {
        var configNodes = [{
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
        }];

        // Map any additional
        configNodes = configNodes.map(function(x) {
          if(self.options && self.options.config) {
            for(var name in self.options.config) {
              x.options[name] = self.options.config[name];
            }
          }

          return x;
        });

        // Add configuration servers
        self.topology.addConfigurationServers(configNodes, {
          replSet: 'rs3'
        }).then(function() {
          var proxyNodes = [{
            bind_ip: 'localhost', port: 51000, configdb: 'localhost:35000,localhost:35001,localhost:35002'
          }, {
            bind_ip: 'localhost', port: 51001, configdb: 'localhost:35000,localhost:35001,localhost:35002'
          }];

          // Map any additional
          proxyNodes = proxyNodes.map(function(x) {
            if(self.options && self.options.proxy) {
              for(var name in self.options.proxy) {
                x[name] = self.options.proxy[name];
              }
            }

            return x;
          });

          // Add proxies
          self.topology.addProxies(proxyNodes, {
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
