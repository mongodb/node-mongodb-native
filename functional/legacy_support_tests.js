var f = require('util').format;

exports['Should correctly run basic ordered insert using legacy code'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var LegacySupport = require('../../../lib/legacy/legacy_support'); 
    var server = new configuration.require.Server({
        host: configuration.host
      , port: configuration.port
      , fallback: new LegacySupport()
    });
    
    // Connect
    server.connect();
    
    // Set up listener
    server.on('connect', function(server) {      
      server.insert(f("%s.legacy_insert0", configuration.db), [{a:1}, {a:2}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, result) {
        test.equal(null, err);
        test.ok(result.result.ok);
        test.equal(2, result.result.n);
        test.done();
      });
    });
  }
}

exports['Should correctly run basic unordered insert using legacy code'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var LegacySupport = require('../../../lib/legacy/legacy_support'); 
    var server = new configuration.require.Server({
        host: configuration.host
      , port: configuration.port
      , fallback: new LegacySupport()
    });
    
    // Connect
    server.connect();
    
    // Set up listener
    server.on('connect', function(server) {      
      server.insert(f("%s.legacy_insert1", configuration.db), [{a:1}, {a:2}], {
        writeConcern: {w:1}, ordered:false
      }, function(err, result) {        
        test.equal(null, err);
        test.ok(result.result.ok);
        test.equal(2, result.result.n);
        test.done();
      });
    });
  }
}

exports['Should correctly run basic ordered update using legacy code'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var LegacySupport = require('../../../lib/legacy/legacy_support'); 
    var server = new configuration.require.Server({
        host: configuration.host
      , port: configuration.port
      , fallback: new LegacySupport()
    });
    
    // Connect
    server.connect();
    
    // Set up listener
    server.on('connect', function(server) {      
      server.update(f("%s.legacy_update0", configuration.db), [
            { q: { a:1 }, u: { $set: {b : 1} }, upsert:true }
          , { q: { a:2 }, u: { $set: {b : 2} }, upsert:true }
        ], {
        writeConcern: {w:1}, ordered:true
      }, function(err, result) {        
        test.equal(null, err);
        test.ok(result.result.ok);
        test.equal(2, result.result.n);
        test.ok(result.result.nModified == null || result.result.nModified == 0);
        test.done();
      });
    });
  }
}

exports['Should correctly run basic unordered update using legacy code'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var LegacySupport = require('../../../lib/legacy/legacy_support'); 
    var server = new configuration.require.Server({
        host: configuration.host
      , port: configuration.port
      , fallback: new LegacySupport()
    });
    
    // Connect
    server.connect();
    
    // Set up listener
    server.on('connect', function(server) {      
      server.update(f("%s.legacy_update1", configuration.db), [
            { q: { a:1 }, u: { $set: {b : 1} }, upsert:true }
          , { q: { a:2 }, u: { $set: {b : 2} }, upsert:true }
        ], {
        writeConcern: {w:1}, ordered:false
      }, function(err, result) {        
        test.equal(null, err);
        test.ok(result.result.ok);
        test.equal(2, result.result.n);
        test.ok(result.result.nModified == null || result.result.nModified == 0);
        test.done();
      });
    });
  }
}

exports['Should correctly run basic ordered remove using legacy code'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var LegacySupport = require('../../../lib/legacy/legacy_support'); 
    var server = new configuration.require.Server({
        host: configuration.host
      , port: configuration.port
      , fallback: new LegacySupport()
    });
    
    // Connect
    server.connect();
    
    // Set up listener
    server.on('connect', function(server) {      
      server.insert(f("%s.legacy_remove0", configuration.db), [{a:1}, {a:2}], {
        writeConcern: {w:1}, ordered:false
      }, function(err, result) {        
        server.remove(f("%s.legacy_remove0", configuration.db), [
              { q: { a:1 }, limit: 1 }
            , { q: { a:2 }, limit: 1 }
          ], {
          writeConcern: {w:1}, ordered:true
        }, function(err, result) {        
          test.equal(null, err);
          test.ok(result.result.ok);
          test.equal(2, result.result.n);
          test.ok(result.result.nModified == null || result.result.nModified == 0);
          test.done();
        });
      });
    });
  }
}

exports['Should correctly run basic unordered remove using legacy code'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var LegacySupport = require('../../../lib/legacy/legacy_support'); 
    var server = new configuration.require.Server({
        host: configuration.host
      , port: configuration.port
      , fallback: new LegacySupport()
    });
    
    // Connect
    server.connect();
    
    // Set up listener
    server.on('connect', function(server) {      
      server.insert(f("%s.legacy_remove0", configuration.db), [{a:1}, {a:2}], {
        writeConcern: {w:1}, ordered:false
      }, function(err, result) {        
        server.remove(f("%s.legacy_remove0", configuration.db), [
              { q: { a:1 }, limit: 1 }
            , { q: { a:2 }, limit: 1 }
          ], {
          writeConcern: {w:1}, ordered:false
        }, function(err, result) {        
          test.equal(null, err);
          test.ok(result.result.ok);
          test.equal(2, result.result.n);
          test.ok(result.result.nModified == null || result.result.nModified == 0);
          test.done();
        });
      });
    });
  }
}

exports['Should fail due to illegal ordered insert operation'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var LegacySupport = require('../../../lib/legacy/legacy_support'); 
    var server = new configuration.require.Server({
        host: configuration.host
      , port: configuration.port
      , fallback: new LegacySupport()
    });
    
    // Connect
    server.connect();
    
    // Set up listener
    server.on('connect', function(server) {      
      server.insert(f("%s.legacy_illegal0", configuration.db), [{$set: {a: 1}}, {a:2}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, result) {        
        test.equal(null, err);
        test.equal(1, result.result.ok);
        test.equal(0, result.result.n);
        test.equal(1, result.result.writeErrors.length);
        test.equal(0, result.result.writeErrors[0].index);
        test.done();
      });
    });
  }
}

exports['Should fail due to illegal unordered insert operation'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var LegacySupport = require('../../../lib/legacy/legacy_support'); 
    var server = new configuration.require.Server({
        host: configuration.host
      , port: configuration.port
      , fallback: new LegacySupport()
    });
    
    // Connect
    server.connect();
    
    // Set up listener
    server.on('connect', function(server) {      
      server.insert(f("%s.legacy_illegal0", configuration.db), [{$set: {a: 1}}, {a:2}], {
        writeConcern: {w:1}, ordered:false
      }, function(err, result) {        
        test.equal(null, err);
        test.equal(1, result.result.ok);
        test.equal(1, result.result.n);
        test.equal(1, result.result.writeErrors.length);
        test.equal(0, result.result.writeErrors[0].index);
        test.done();
      });
    });
  }
}

exports['Should fail due to illegal ordered update operation'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var LegacySupport = require('../../../lib/legacy/legacy_support'); 
    var server = new configuration.require.Server({
        host: configuration.host
      , port: configuration.port
      , fallback: new LegacySupport()
    });
    
    // Connect
    server.connect();
    
    // Set up listener
    server.on('connect', function(server) {      
      server.update(f("%s.legacy_illegal0", configuration.db), [
            { q: { $set: { a:1 } }, u: { $set: {b : 1} }, upsert:true }
          , { q: { a:2 }, u: { $set: {b : 2} }, upsert:true }
        ], {
        writeConcern: {w:1}, ordered:true
      }, function(err, result) {        
        test.equal(null, err);
        test.equal(1, result.result.ok);
        test.equal(0, result.result.n);
        test.equal(1, result.result.writeErrors.length);
        test.equal(0, result.result.writeErrors[0].index);
        test.done();
      });
    });
  }
}

exports['Should fail due to illegal unordered update operation'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var LegacySupport = require('../../../lib/legacy/legacy_support'); 
    var server = new configuration.require.Server({
        host: configuration.host
      , port: configuration.port
      , fallback: new LegacySupport()
    });
    
    // Connect
    server.connect();
    
    // Set up listener
    server.on('connect', function(server) {      
      server.update(f("%s.legacy_illegal0", configuration.db), [
            { q: { $set: { a:1 } }, u: { $set: {b : 1} }, upsert:true }
          , { q: { a:2 }, u: { $set: {b : 2} }, upsert:true }
        ], {
        writeConcern: {w:1}, ordered:false
      }, function(err, result) {        
        test.equal(null, err);
        test.equal(1, result.result.ok);
        test.equal(1, result.result.n);
        test.equal(1, result.result.writeErrors.length);
        test.equal(0, result.result.writeErrors[0].index);
        test.done();
      });
    });
  }
}

exports['Should fail due to illegal ordered remove operation'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var LegacySupport = require('../../../lib/legacy/legacy_support'); 
    var server = new configuration.require.Server({
        host: configuration.host
      , port: configuration.port
      , fallback: new LegacySupport()
    });
    
    // Connect
    server.connect();
    
    // Set up listener
    server.on('connect', function(server) {      
      server.remove(f("%s.legacy_illegal0", configuration.db), [
            { q: { $set: { a:1 } }, limit: 1 }
          , { q: { a:2 }, limit: 1 }
        ], {
        writeConcern: {w:1}, ordered:true
      }, function(err, result) {        
        test.equal(null, err);
        test.equal(1, result.result.ok);
        test.equal(0, result.result.n);
        test.equal(1, result.result.writeErrors.length);
        test.equal(0, result.result.writeErrors[0].index);
        test.done();
      });
    });
  }
}

exports['Should fail due to illegal unordered remove operation'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var LegacySupport = require('../../../lib/legacy/legacy_support'); 
    var server = new configuration.require.Server({
        host: configuration.host
      , port: configuration.port
      , fallback: new LegacySupport()
    });
    
    // Connect
    server.connect();
    
    // Set up listener
    server.on('connect', function(server) {      
      server.remove(f("%s.legacy_illegal0", configuration.db), [
            { q: { $set: { a:1 } }, limit: 1 }
          , { q: { a:2 }, limit: 1 }
        ], {
        writeConcern: {w:1}, ordered:false
      }, function(err, result) {        
        test.equal(null, err);
        test.equal(1, result.result.ok);
        test.equal(1, result.result.n);
        test.equal(1, result.result.writeErrors.length);
        test.equal(0, result.result.writeErrors[0].index);
        test.done();
      });
    });
  }
}
