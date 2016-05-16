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
A lof of people run into a similar issue wich is what is the difference between `connectTimeoutMS`, `socketTimeoutMS` and `maxTimeMS` and what values should be used for the different ones. Let's first explain each setting individually setting before discussing the values they should be set to.

| Setting | Default Value MongoClient.connect | Description |
| :----------| :------------- | :------------- |
| connectTimeoutMS | 30000 | The connectTimeoutMS sets the number of milliseconds a socket will stay inactive before closing during the connection phase of the driver. That is to say when the application initiates a connection or when a Replicaset conntects to new members or re-connect to new members. A value of `10000` milliseconds would mean the driver would wait up to 10 seconds for a response from a MongoDB server.|
| socketTimeoutMS | 30000 | The socketTimeoutMS sets the number of milliseconds a socket will stay inactive after the driver has successfully connected before closing. That is to say that if the value was set to `30000` milliseconds the socket would close if there was no activity during a 30 seconds window.|
| maxTimeMS | N/A | The maxTimeMS setting specifies how long MongoDB should run an operation before cancelling it. If you set the the maxTimeMS to `10000` milliseconds, any operation that ran over that limit would return an timeout error|

Now let's look at how the different settings affect your experience of using the driver using some example scenarios and what resonable values might be for the settings outlined.

#### Fail fast during connection
We want to ensure that the driver does not hang during the connection phase or spend an unnecessarily long time attempting to connect to Replicaset members who are not reachable.

As a general rule you need to ensure that the `connectTimeoutMS` setting is not lower than the largest network latency you have to a member of the set. Say one of the `secondary` members is on the other side of the planet and has a latency of `10000` milliseconds setting the `connectTimeoutMS` to anything lower will ensure the driver can never correctly connect to that member.

### socketTimeoutMS as a way to abort operations
One of the main ways people use socketTimeoutMS is to abort operations. This is in general a very bad idea. And there are a couple of reasons.

1. Closing the socket, will force a reconnect of the connection pool of the driver and introduce latency to any other operations queued up. Chronically slow operations will thus cause a reconnect storm impacting throughput and performance.
2. Closing the socket does not terminate the operation, it will still be running on MongoDB. This could cause data inconsistencies if your application retries the operation on failure for example.

That said the there is a very important usage for `socketTimeoutMS`. If the MongoDB process dies or a misconfigured `firewall` closes socket connections without sending a `FIN` packet dropping all subsequent packets on the floor there is no way for the driver to detect if the connection has died. In this case the socketTimeoutMS is essential to ensure the sockets are closed correctly.

A general rule of thumb is to set `socketTimeoutMS` to `2-3x` the time of the slowest operation run through the driver.

### socketTimeoutMS and big connection pools
One of the gotchas around socketTimeoutMS and a big pool seems to be experienced by a lot of people. Say you are performing a backend batch operation and storing the data in MongoDB. You `pool` size if 5 sockets and you have set `socketTimeoutMS` to `5000` milliseconds. You have an operation happening on average every `3000` milliseconds. You still get constant reconnects. Why ?

Well each socket will timeout after `5000` milliseconds. That means that all sockets must be exercised during that `5000` milliseconds period to avoid them closing. One message every `3000` milliseconds is not enough to keep the sockets active, meaning several of the sockets will timeout after `5000` milliseconds.

In this case you should reduce the pool size to `1` to get the desired effect.

### The special meaning of 0
Setting `connectTimeoutMS` and `socketTimeoutMS` to the value `0` has a special meaning. On the face of it, it means never timeout. However this is a truth with some modifications. Setting it to `0` actually means apply the operating system default socket timeout value.

### maxTimeMS is the option you are looking for
Most people try to set a low `socketTimeoutMS` value to abort server operations. As we have proved above this does not work. To work correctly you want to use the `maxTimeMS` setting on server operations. This will make MongoDB itself abort the operation if it runs for more than `maxTimeMS` milliseconds. A simple example is below performing a `find` operation.

```js
// Execute a find command
col.find({"$where": "sleep(100) || true"})
  .maxTimeMS(50)
  .count(function(err, count) {
});
```

### What does the keepAlive setting do ?
Keep alive is a setting on the sockets available from Node.js that in theory will keep a socket alive by sending probes every once in a while to MongoDB keeping the connection alive.

However this only works if the operating system supports `SO_KEEPALIVE` and might still not solve the issue of firewalls as they might still ignore or drop these packets meaning it has no effect.

### On misconfigured firewalls
Internal firewalls in between applications servers and MongoDB are in many cases misconfigured, being to aggressive in their culling of sockets connections. Many a problem have been diagnosed to a misconfiguration in a firewall between a DMC and internal MongoDB databases. If you are experiencing weird behavior it might be wise to investigate the settings on said firewall. Things to check for are.

1. The firewall should send a FIN packet when closing a socket allowing the driver to detect the socket as closed.
2. The firewall should allow keepAlive probes to allow for persistent connections.

# I'm getting ECONNRESET when calling MongoClient.connect
You might have decided to use a big connection pool with your node project.

```js
MongoClient.connect('mongodb://localhost:27017/test?maxPoolSize=5000',
  function(err, db) {
    // connection
  });
```

When executing the operation you receive an error containg the `ECONNRESET` message. You have run into the file descriptor limit for your node.js process.

In most operating systems each socket connection is associated with a file descriptor. Many operating systems have a limit on how many such file descriptors can be used by a single process.

For the example above let's assume the limit of file descriptors for each process is `1000`. Once the driver attempts to open it's `1001` socket the operating system returns an error as the process has exceeded the maximum file descriptors allowed for a single process.

The way to fix this issue is to increase the number of file descriptors for the Node.js process. On OSX and Linux you do this using the `ulimit` method.

```
ulimit -n 6000
```

The command above will set the maximum number of file descriptors for the process to `6000` descriptors allowing us to correctly connect with a pool size of `5000` sockets.

# How can I avoid a very slow operation delaying other operations ?
You have an operation that takes a fair bit of time to execute. As you execute them you find that other fast operations are affected due to the round-robin nature of the driver pool in the end leaving all the fast operations trapped behind slow executing operations.

You have run into the `Slow Train` problem. It's tied to the fact that although the driver is Async, MongoDB is not. MongoDB as of 3.2 uses a single execution thread per socket. This means that it will only execute a single operation on a socket at any given point in time. Any operations sent to that socket will have to wait until the current operation is finished. This causes a slow train effect.

```
Socket 1 <- [S, F, F, F]
Socket 2 <- [S, F, F, F]
...
Socket N <- [S, F, F, F]
```

Unfortunately until MongoDB starts multiplexing threads on sockets or becomes an asynchronous there is only one reasonable strategy to avoid this problem.

{{% note %}}
Create a separate connection pool for the slow executing operations, thus isolating the slow operations from the fast operations.
{{% /note %}}

# Ensure you connection string is valid for Replica Set

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
