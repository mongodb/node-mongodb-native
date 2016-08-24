+++
date = "2015-03-19T12:53:35-04:00"
title = "Upgrade Guide"
[menu.main]
  identifier = "Upgrade Guide"
  weight = 45
  pre = "<i class='fa fa-cog'></i>"
+++

## What's New in 2.2

Key features of the 2.2 driver include:

- Redesigned Connection Pool.
- Connection close will drain any outstanding operations.
- replicaSet parameter **MUST** be specified if using MongoClient to connect to replicaset, due to SDAM specification implementation.
- domain support disabled by default, enable with parameter **domainsEnabled** on MongoClient or on the Server/ReplSet/Mongos.

## What's New in 2.1

Key features of the 2.1 driver include:

- Implements the new GridFS specification
- Implements support for the new 3.2 wire protocol level **find**, **getMore** and **killCursor** commands
- A growing/shrinking connection pool
- A worker-based connection pool which minimizes the impact of slow operations on throughput and latency when the number of slow operations is less than the number of connections in the pool
- Topology monitoring specification implementation, allowing applications to monitor the view of the topology as it changes

## What's New in 2.0

Key features of the 2.0 driver include:

- Adherence to the SDAM (Server Discovery and Monitoring Specification)
- Implementation of the CRUD Specification
- Performance improvements
- New JS-BSON parser which replaces the C++ extension
- A new core driver on top of which you can build alternative or experimental driver APIs
- APM (Application Performance Monitoring) API

[Driver revision history](https://github.com/mongodb/node-mongodb-native/blob/2.1/HISTORY.md).

## Compability

The following table specifies the compatibility of the MongoDB Node.js driver for use with a specific version of MongoDB.

|Node.js Driver | MongoDB 2.4 | MongoDB 2.6|MongoDB 3.0 |MongoDB 3.2|
|---------------|-------------|------------|------------|-----------|
|Version >= 2.1 |  ✓  |  ✓  |  ✓  |  ✓  |
|Version >= 2.0.14|  ✓  |  ✓  |  ✓  |    |


The following table specifies the compatibility of the driver for use with a specific version of Node.js.


|Node.js Driver | Node.js v0.8.X |Node.js v0.10.X| Node.js v0.12.X|Node.js v4.X.X
|---------------|----------------|---------------|----------------|--------------|
|Version 2.2.X |  ✓  |  ✓  |  ✓  |  ✓  |
|Version 2.1.X |  ✓  |  ✓  |  ✓  |  ✓  |
|Version 2.0.X|  ✓  |  ✓  |  ✓  |  ✓  |

## Upgrade

See the [upgrading guide]({{<ref "upgrade-migration/upgrading.md">}}) on how to upgrade to 2.x
