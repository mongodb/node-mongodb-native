+++
date = "2015-03-19T12:53:30-04:00"
title = "Frequently Asked Questions"
[menu.main]
  parent = "Reference"
  identifier = "FAQ"
  weight = 140
  pre = "<i class='fa'></i>"
+++

# What is the difference between connectTimeoutMS, socketTimeoutMS and maxTimeMS ?

| Setting | Default Value MongoClient.connect | Description |
| :----------| :------------- | :------------- |
| connectTimeoutMS | 30000 | The connectTimeoutMS sets the number of milliseconds a socket stays inactive before closing during the connection phase of the driver. That is to say, when the application initiates a connection, when a replica set connects to new members, or when a replica set reconnects to members. A value of 10000 milliseconds would mean the driver would wait up to 10 seconds for a response from a MongoDB server.|
| socketTimeoutMS | 30000 | The socketTimeoutMS sets the number of milliseconds a socket stays inactive after the driver has successfully connected before closing. If the value is set to 30000 milliseconds, the socket closes if there is no activity during a 30 seconds window.|
| maxTimeMS | N/A | The maxTimeMS setting specifies how long MongoDB should run an operation before cancelling it. If the maxTimeMS is set to 10000 milliseconds, any operation that runs over that limit returns a timeout error.|

#### Fail fast during connection
In this scenario, the developer wants to ensure that the driver does not
hang during the connection phase or spend an unnecessarily long time
attempting to connect to replica set members who are not reachable.

As a general rule you should ensure that the `connectTimeoutMS` setting
is not lower than the longest network latency you have to a member of
the set. If one of the `secondary` members is on the other side of the
planet and has a latency of 10000 milliseconds, setting the
`connectTimeoutMS` to anything lower will prevent the driver from ever
connecting to that member.

### socketTimeoutMS as a way to abort operations
Developers sometimes try to use ``socketTimeoutMS``
to end operations which may run for too long and slow
down the application, but doing so may not achieve the intended result.

Closing the socket forces a reconnect of the driver's connection pool
and introduces latency to any other operations which are queued up.
Chronically slow operations will therefore cause a large number of
reconnect requests, negatively impacting throughput and performance.

Also, closing the socket does not terminate the operation; it will continue
to run on the MongoDB server, which could cause data inconsistencies
if the application retries the operation on failure.

That said, there are some important use cases for `socketTimeoutMS`. It's
possible that a MongoDB process may error out, or that a misconfigured
firewall may close a socket connection without sending a `FIN` packet.
In these cases there is no way for the driver to detect that the
connection has died, and `socketTimeoutMS` is essential to ensure that the
sockets are closed correctly.

A good rule of thumb is to set `socketTimeoutMS` to two to three times the
length of the slowest operation which runs through the driver.

### socketTimeoutMS and large connection pools
Having a large connection pool does not always reduce reconnection
requests. Consider the following example: an application has
a connection pool size of 5 sockets and has `socketTimeoutMS` set
to 5000 milliseconds. Operations occur, on average, every 3000
milliseconds, and reconnection requests are frequent.
Each socket times out after 5000 milliseconds, which means that all
sockets must do something during that 5000 millisecond period to
avoid closing. One message every 3000 milliseconds is not enough to
keep the sockets active, so several of the sockets will time out
after 5000 milliseconds.

Reducing the pool size to 1 will fix the problem.

### The special meaning of 0
Setting `connectTimeoutMS` and `socketTimeoutMS` to the value 0 has
a special meaning. It causes the application to use the operating
system's default socket timeout value.

### maxTimeMS is the option you are looking for
Many developers set a low `socketTimeoutMS` value, intending
to prevent long-running server operations from slowing down
the application. `maxTimeMS` is usually a better choice; it allows
MongoDB itself to cancel operations which run for more than `maxTimeMS`
milliseconds.

The following example demonstrates how to use `MaxTimeMS` with a `find`
operation.

```js
// Execute a find command
col.find({"$where": "sleep(100) || true"})
  .maxTimeMS(50)
  .count(function(err, count) {
});
```

### What does the keepAlive setting do?
`keepAlive` is a socket setting available from Node.js that in theory
will keep a socket alive by sending periodic probes to MongoDB.
However, this only works if the operating system supports
`SO_KEEPALIVE`, and still might not work if a firewalls
ignores or drops the `keepAlive` packets.

### On misconfigured firewalls
Internal firewalls which exist between application servers and MongoDB
are often misconfigured, and are overly aggressive in their culling of
socket connections. If you experience unexpected network behavior, here
are some things to check:

1. The firewall should send a FIN packet when closing a socket,
allowing the driver to detect that the socket is closed.
2. The firewall should allow keepAlive probes.

# I'm getting ECONNRESET when calling MongoClient.connect
This can occur if the connection pool is too large.

```js
MongoClient.connect('mongodb://localhost:27017/test?maxPoolSize=5000',
  function(err, db) {
    // connection
  });
```
If this operation causes an `ECONNRESET` error, you may have run into
the file descriptor limit for your Node.js process.

In most operating systems, each socket connection is associated with a
file descriptor. Many operating systems have a limit on how many such
file descriptors can be used by a single process.

The way to fix the descriptor limit issue is to increase the number of
file descriptors for the Node.js process. On Mac OS and Linux you do
this with the `ulimit` shell command.

```
ulimit -n 6000
```

This sets the maximum number of file descriptors for the process to
6000, allowing Node.js to connect with a pool size of 5000 sockets.

# How can I prevent a slow operation from delaying other operations?

{{% note %}}
Create a separate connection pool for the slow executing operations, thus isolating the slow operations from the fast operations.
{{% /note %}}

While Node.js is asynchronous, MongoDB is not. Currently, MongoDB uses a single execution thread per socket. This means that it will only execute a single operation on a socket at any given point in time. Any other operations sent to that socket will have to wait until the current operation is finished. If you have a slow-running operation which holds up other operations,
the best solution is to create a separate connection pool for the slow operation, isolating it from other, faster
operations.

# Ensure your connection string is valid for Replica Set

The connection string passed to the driver must use the fully qualified host names for the servers as set in the replicaset config. Given the following configuration settings for your replicaset.

```js
{
	"_id" : "testSet",
	"version" : 1,
	"protocolVersion" : 1,
	"members" : [
		{
			"_id" : 1,
			"host" : "server1:31000",
		},
		{
			"_id" : 2,
			"host" : "server2:31001",
		},
		{
			"_id" : 3,
			"host" : "server3:31002",
		}
	]
}
```

You must ensure `server1`, `server2` and `server3` are resolvable from the driver for the Replicaset discovery and failover to work correctly.

