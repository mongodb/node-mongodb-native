Replicasets
===========

## Introduction

Replica sets is the asynchronous master/slave replication added to Mongodb that takes care off all the failover and recovery for the member nodes. According to the mongodb documentation a replicaset is

  * Two or more nodes that are copies of each other
  * Automatic assignment of a primary(master) node if none is available
  * Drivers that automatically detect the new master and send writes to it
  
More information at [Replicasets](http://www.mongodb.org/display/DOCS/Replica+Sets)

## Driver usage

To create a new replicaset follow the instructions on the mongodb site to setup the config and the replicaset instances. Then using the driver.

    var replSet = new ReplSetServers( [ 
        new Server( 127.0.0.1, 30000, { auto_reconnect: true } ),
        new Server( 127.0.0.1, 30001, { auto_reconnect: true } ),
        new Server( 127.0.0.1, 30002, { auto_reconnect: true } )
      ], 
      {rs_name:RS.name}
    );

    var db = new Db('integration_test_', replSet);
    db.open(function(err, p_db) {
      // Do you app stuff :)
    })

The ReplSetSrvers object has the following parameters

    var replSet = new ReplSetSrvers(servers, options)
    
Where

  * `servers` is an array of `Server` objects
  * `options` can contain the following options
    * `rs_name` is the name of the replicaset you configured when you started the server, you can have multiple replicasets running on your servers.
    * `read_secondary` set's the driver to read from secondary servers (slaves) instead of only from the primary(master) server.

The Db object can accept write concern options such as w:2, wtimeout: 5000. See [getLastError](http://www.mongodb.org/display/DOCS/Verifying+Propagation+of+Writes+with+getLastError) for a description.

To set these values you pass the options in as part of strict mode. The following configuration ensures all writes are replicated to 2 dbs within 5 seconds before success is returned. If the replication does not occur a timeout error will be returned instead. Note that the data may or may not be on 1 or both servers when that occurs. 

    options = {strict: {w:2, wtimeout: 5000}}
    var db = new Db('integration_test', replSet, options);

All options for getLastError are described here: [getLastError options](http://www.mongodb.org/display/DOCS/Verifying+Propagation+of+Writes+with+getLastError). They can be passed in via the strict options object.
    

