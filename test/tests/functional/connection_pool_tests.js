var ConnectionPool = require('../../../lib/mongodb/connection/connection_pool').ConnectionPool;

/**
 * @ignore
 */
exports['Should Correctly create a pool instance with the expected values'] = function(configuration, test) {
  var connectionPool = new ConnectionPool('localhost', 2000, 1, null, {timeout:100, noDelay:true});
  test.equal(100, connectionPool.socketOptions.timeout);
  test.equal(true, connectionPool.socketOptions.noDelay);
  test.equal(null, connectionPool.socketOptions.encoding);
  test.equal(0, connectionPool.socketOptions.bufferSize);    
  test.done();
}

/**
 * @ignore
 */
exports['Should correctly fail due to no server'] = function(configuration, test) {
  if(configuration.db().serverConfig instanceof configuration.getMongoPackage().ReplSet) return test.done();
  var connectionPool = new ConnectionPool('localhost', 2000, 4, null, {timeout:100, noDelay:true});

  // // Add event handler that will fire once the pool is ready
  connectionPool.on("poolReady", function(err, result) {      
  })

  // Add event handler that will fire when it fails
  connectionPool.on("error", function(err, connection) {
    test.equal(0, connectionPool.openConnections.length)
    test.done();
  });
  
  // Start the pool
  connectionPool.start();    
}

/**
 * @ignore
 */
exports['Should Correctly create a pool of connections and receive an ok when all connections are active'] = function(configuration, test) {
  if(configuration.db().serverConfig instanceof configuration.getMongoPackage().ReplSet) return test.done();
  var connectionPool = new ConnectionPool('localhost', 27017, 4, {timeout:100, noDelay:true});

  // Add event handler that will fire once the pool is ready
  connectionPool.on("poolReady", function() {
    connectionPool.stop();
    test.done();
  })
  
  // Start the pool
  connectionPool.start();    
}

/**
 * @ignore
 */
exports['Should Correctly connect and then force a restart creating new connections'] = function(configuration, test) {
  if(configuration.db().serverConfig instanceof configuration.getMongoPackage().ReplSet) return test.done();
  var connectionPool = new ConnectionPool('localhost', 27017, 4, {timeout:100, noDelay:true});
  var done = false;

  // Add event handler that will fire once the pool is ready
  connectionPool.on("poolReady", function() {      
    // Restart      
    if(done) {
      connectionPool.stop();
      test.done();        
    } else {
      // Trigger stop
      connectionPool.restart();
      done = true;
    }
  })
  
  // Start the pool
  connectionPool.start();        
}