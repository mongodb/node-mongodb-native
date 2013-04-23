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

    var replSet = new ReplSet( [ 
        new Server( 127.0.0.1, 30000),
        new Server( 127.0.0.1, 30001),
        new Server( 127.0.0.1, 30002)
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

## Replicaset options
Several options can be passed to the `Replicaset` constructor with `options` parameter.  

* `rs_name` is the name of the replicaset you configured when you started the server, you can have multiple replicasets running on your servers.
* `read_secondary` set's the driver to read from secondary servers (slaves) instead of only from the primary(master) server.
* `socketOptions` - a collection of pr socket settings

## Socket options
Several options can be set for the `socketOptions`.

* `timeout` = set seconds before connection times out `default:0`
* `noDelay` = Disables the Nagle algorithm `default:true`
* `keepAlive` = Set if keepAlive is used `default:0`, which means no keepAlive, set higher than 0 for keepAlive
* `encoding` = 'ascii'|'utf8'|'base64' `default:null`