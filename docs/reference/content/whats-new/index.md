+++
date = "2015-03-19T12:53:35-04:00"
title = "What's New"
[menu.main]
  identifier = "Whats New"
  weight = 10
  pre = "<i class='fa fa-cog'></i>"
+++

# What's New in 2.0

Key features of the 2.0 driver include:

- Adherence to the SDAM (Server Discovery and Monitoring Specification).
- Implementation of the CRUD Specification.
- Performance improvements.
- New JS-BSON parser that supplants the C++ extension.
- A new core driver on top of which you can build alternative or experimental driver APIs
- APM (Application Performance Monitoring) API.

# What's New in 2.1

Key features of the 2.1 driver include:

- Implements the new GridFS specification
- Implements support for the new 3.2 wireprotocol level find, getMore and killCursor commands.
- A growing/shrinking connection pool.
- A worker based connection pool minimizing the impact of slow operations on throughput and latency when the number of slow operations < the number of connections in the pool.
- Topology monitoring specification implementation allowing applications to monitor the view of the topology as it changes.

[Driver revision history](https://github.com/mongodb/node-mongodb-native/blob/2.1/HISTORY.md).

## Upgrading

See the [upgrading guide]({{<ref "whats-new/upgrading.md">}}) on how to upgrade to 2.0
