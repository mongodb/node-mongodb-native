+++
date = "2015-03-19T12:53:35-04:00"
title = "Upgrade Guide"
[menu.main]
  identifier = "Upgrade Guide"
  weight = 45
  pre = "<i class='fa fa-cog'></i>"
+++

# What's new in 3.2

- Supports new "Unified Topology" for resolving servers (opt in with `useUnifiedTopology` option for `MongoClient`)
- Supports `session.withTransaction` helper
- Supports Asynchronous Iteration (`for await...` syntax) on cursors
- Supports Database-level Aggregations (`db.aggregate(pipeline, options)`)

[Full 3.2 Changes Here](https://github.com/mongodb/node-mongodb-native/releases/tag/v3.2.1)

# What's new in 3.1

- Support for MongoDB version 4.0
- Support for Transactions
- Support for authentication with SCRAM-SHA-256
- Support for new URL parser (opt in with `useNewUrlParser` option for `MongoClient`)

[Full 3.1 Changes Here](https://github.com/mongodb/node-mongodb-native/blob/3.1/HISTORY.md#310-2018-06-27)

# What's new in 3.0

- Support added for Retryable Writes
- Support added for DNS Seedlists
- Support added for Change Streams
- Support added for sessions
- `MongoClient.connect` now returns a `Client` instead of a `DB`.

[Full 3.0 Changes Here](https://github.com/mongodb/node-mongodb-native/blob/master/CHANGES_3.0.0.md)

# What's New in 2.3

Key features of the 2.3 driver include:

- Implements [Decimal128](https://docs.mongodb.org), a decimal
  floating-point numbering format that occupies 16 bytes (128 bits).
  See the
  [CRUD tutorial]({{< relref "tutorials/crud.md#specify-a-data-type" >}})
  for an example.
<!-- NOTE: placeholder link to manual entry -->

# What's New in 2.2

Key features of the 2.2 driver include:

- Redesigned Connection Pool.
- Connection close will drain any outstanding operations.
- replicaSet parameter **MUST** be specified if using MongoClient to connect to replicaset, due to SDAM specification implementation.
- Domain support disabled by default, enable with parameter **domainsEnabled** on MongoClient or on the Server/ReplSet/Mongos.

# What's New in 2.1

Key features of the 2.1 driver include:

- Implements the new GridFS specification
- Implements support for the new 3.2 wire protocol level **find**, **getMore** and **killCursor** commands
- A growing/shrinking connection pool
- A worker-based connection pool which minimizes the impact of slow operations on throughput and latency when the number of slow operations is less than the number of connections in the pool
- Topology monitoring specification implementation, allowing applications to monitor the view of the topology as it changes

# What's New in 2.0

Key features of the 2.0 driver include:

- Adherence to the SDAM (Server Discovery and Monitoring Specification)
- Implementation of the CRUD Specification
- Performance improvements
- New JS-BSON parser which replaces the C++ extension
- A new core driver on top of which you can build alternative or experimental driver APIs
- APM (Application Performance Monitoring) API

[Driver revision history](https://github.com/mongodb/node-mongodb-native/blob/2.1/HISTORY.md).

## Upgrading

See the [3.0 Changes](https://github.com/mongodb/node-mongodb-native/blob/3.0.0/CHANGES_3.0.0.md) on how to upgrade to 3.0
See the [upgrading guide]({{<ref "upgrade-migration/upgrading.md">}}) on how to upgrade to 2.0
