---
aliases:
- /doc/installing/
date: 2013-07-01
menu:
  main:
    parent: tutorials
next: /tutorials/crud_operations
prev: /tutorials/connecting
title: Connection URI
weight: 2
---
## The URL connection format

    mongodb://[username:password@]host1[:port1][,host2[:port2],...[,hostN[:portN]]][/[database][?options]]

The URL format is unified across official drivers from Mongodb with some options not supported on some drivers due to implementation differences. The ones not supported by the Node.js driver are left out for simplicities sake.

### Basic parts of the url
  * `mongodb://` is a required prefix to identify that this is a string in the standard connection format.
  * `username:password@` is optional. If given, the driver will attempt to login to a database after connecting to a database server.
  * `host1` is the only required part of the URI. It identifies either a hostname, IP address, or unix domain socket
  * `:portX` is optional and defaults to :27017 if not provided.
  * `/database` is the name of the database to login to and thus is only relevant if the username:password@ syntax is used. If not specified the "admin" database will be used by default.
  * `?options` are connection options. Note that if database is absent there is still a / required between the last host and the ? introducing the options. Options are name=value pairs and the pairs are separated by "&". For any unrecognized or unsupported option, a driver should log a warning and continue processing. A driver should not support any options that are not explicitly defined in this specification. This is in order to reduce the likelihood that different drivers will support overlapping that differ in small but incompatible ways (like different name, different values, or different default value).

### Replica set configuration:
* `replicaSet=name`
    * The driver verifies that the name of the replica set it connects to matches this name. Implies that the hosts given are a seed list, and the driver will attempt to find all members of the set.
    * No default value.

### Connection Configuration:
* `ssl=true|false|prefer`
    * true: the driver initiates each connections with SSL
    * false: the driver initiates each connection without SSL
    * prefer: the driver tries to initiate each connection with SSL, and falls back to without SSL if it fails.
    * Default value is false.

* `connectTimeoutMS=ms`
    * How long a connection can take to be opened before timing out.
    * Current driver behavior already differs on this, so the default must be left to each driver. For new implementations, the default should be to never timeout.

* `socketTimeoutMS=ms`
    * How long a send or receive on a socket can take before timing out.
    * Current driver behavior already differs on this, so the default must be left to each driver. For new implementations, the default should be to never timeout.

### Connection pool configuration:
* `maxPoolSize=n:` The maximum number of connections in the connection pool
    * Default value is 5

### Write concern configuration:
More detailed information about write concerns can be found at [http://www.mongodb.org/display/DOCS/getLastError+Command](http://www.mongodb.org/display/DOCS/getLastError+Command)

* `w=wValue`
    * For numeric values above 1, the driver adds { w : wValue } to the getLastError command.
    * wValue is typically a number, but can be any string in order to allow for specifications like "majority"
    * Default value is 1.
      * wValue == -1 ignore network errors
      * wValue == 0 no write acknowledgement
      * wValue == 1 perform a write acknowledgement
      * wValue == 2 perform a write acknowledgement across primary and one secondary
      * wValue == 'majority' perform a write acknowledgement across the majority of servers in the replicaset
      * wValue == 'tag name' perform a write acknowledgement against the replicaset tag name

* `wtimeoutMS=ms`
    * The driver adds { wtimeout : ms } to the getlasterror command.
    * Used in combination with w
    * No default value

* `journal=true|false`
    * true: Sync to journal.
    * false: the driver does not add j to the getlasterror command
    * Default value is false

* `fsync=true|false`
    * true: Sync to disk.
    * false: the driver does not add fsync to the getlasterror command
    * Default value is false
    * If conflicting values for fireAndForget, and any write concern are passed the driver should raise an exception about the conflict.

### Auth options
* `authSource=string:` Used when the user for authentication is stored in another database using indirect authentication.
    * Default value is null

### Read Preference
* `slaveOk=true|false:` Whether a driver connected to a replica set will send reads to slaves/secondaries.
    * Default value is false

* `readPreference=enum:` The read preference for this connection. If set, it overrides any slaveOk value.
    * Enumerated values:
      * primary
      * primaryPreferred
      * secondary
      * secondaryPreferred
      * nearest
    * Default value is primary

* `readPreferenceTags=string.` A representation of a tag set as a comma-separated list of colon-separated key-value pairs, e.g. `dc:ny,rack:1`. Spaces should be stripped from beginning and end of all keys and values. To specify a list of tag sets, using multiple readPreferenceTags, e.g. `readPreferenceTags=dc:ny,rack:1&readPreferenceTags=dc:ny&readPreferenceTags=`
    * Note the empty value, it provides for fallback to any other secondary server if none is available
    * Order matters when using multiple readPreferenceTags
    * There is no default value