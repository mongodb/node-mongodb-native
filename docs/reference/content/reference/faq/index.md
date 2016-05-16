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
| connectTimeoutMS | 30000 | The connectTimeoutMS sets the number of milliseconds a socket stays inactive before closing during the connection phase of the driver. That is to say, when the application initiates a connection or when a Replicaset conntects to new members or re-connect to new members. A value of 10000 milliseconds would mean the driver would wait up to 10 seconds for a response from a MongoDB server.|
| socketTimeoutMS | 30000 | The socketTimeoutMS sets the number of milliseconds a socket stays inactive after the driver has successfully connected before closing. If the value is set to 30000 milliseconds, the socket closes if there is no activity during a 30 seconds window.|
| maxTimeMS | N/A | The maxTimeMS setting specifies how long MongoDB should run an operation before cancelling it. If the maxTimeMS is set to 10000 milliseconds, any operation that runs over that limit returns an timeout error.|

#### Fail fast during connection
In this scenario, the developer wants to ensure that the driver does not hang during the connection phase or spend an unnecessarily long time attempting to connect to replica set members who are not reachable.

As a general rule you should ensure that the `connectTimeoutMS` setting is not lower than the longest network latency you have to a member of the set. If one of the `secondary` members is on the other side of the planet and has a latency of 10000 milliseconds, setting the `connectTimeoutMS` to anything lower will ensure the driver can never correctly connect to that member.

### socketTimeoutMS as a way to abort operations
One of the main uses of `socketTimeoutMS` is to abort operations. This is in general a bad idea, for the following reasons.

1. Closing the socket will force a reconnect of the connection pool of the driver and introduce latency to any other operations queued up. Chronically slow operations will therefore cause a large number of reconnect requests,
   negatively impacting throughput and performance.
2. Closing the socket does not terminate the operation; it will continue to run on MongoDB. This could cause data inconsistencies if the application retries the operation on failure.

That said, there is a very important usage for `socketTimeoutMS`. If a MongoDB process dies or a misconfigured firewall closes socket connections without sending a `FIN` packet, dropping all subsequent packets, there is no way for the driver to detect if the connection has died. In this case `socketTimeoutMS` is essential to ensure the sockets are closed correctly.

A general rule of thumb is to set `socketTimeoutMS` to two to three times the length of the slowest operation run through the driver.

### socketTimeoutMS and large connection pools
One possible issue with `socketTimeoutMS` and a large connection pool which developers frequently encounter is the following: an application performs a backend batch operation and stores the data in MongoDB. The application has a connection pool size of 5 sockets and has `socketTimeoutMS` set to 5000 milliseconds. Operations occur, on average, every 3000 milliseconds, and reconnection requests are frequent. What's going on?

Each socket times out after 5000 milliseconds. That means that all sockets must do something during that 5000 millisecond period to avoid closing. One message every 3000 milliseconds is not enough to keep the sockets active, meaning several of the sockets will time out after 5000 milliseconds.

Reducing the pool size to 1 will fix the problem.

### The special meaning of 0
Setting `connectTimeoutMS` and `socketTimeoutMS` to the value 0 has a special meaning. It causes the application to use the operating system's default socket timeout value.

### maxTimeMS is the option you are looking for
Many developers set a low `socketTimeoutMS` value to prevent long-running server operations. As shown above, this does not always work. Use the `maxTimeMS` setting instead to limit server operation running times. This will allow MongoDB itself to
cancel operations which run for more than `maxTimeMS` milliseconds. 

The following example demonstrates how to use `MaxTimeMS` with a `find` operation.

```js
// Execute a find command
col.find({"$where": "sleep(100) || true"})
  .maxTimeMS(50)
  .count(function(err, count) {
});
```

### What does the keepAlive setting do?
`keepAlive` is a socket setting available from Node.js that in theory will keep a socket alive by sending periodic probes to MongoDB. However, this only works if the operating system supports `SO_KEEPALIVE`, and still might not work if a firewalls
ignores or drops the `keepAlive` packets.

### On misconfigured firewalls
Internal firewalls which exist between application servers and MongoDB are often misconfigured, and are overly aggressive in their culling of socket connections. If you experience unexpected network behavior, here are some things to check:

1. The firewall should send a FIN packet when closing a socket, allowing the driver to detect that the socket is closed.
2. The firewall should allow keepAlive probes.

# I'm getting ECONNRESET when calling MongoClient.connect
This can occur if the connection pool is too large.

```js
MongoClient.connect('mongodb://localhost:27017/test?maxPoolSize=5000',
  function(err, db) {
    // connection
  });
```
If this operation causes an `ECONNRESET` error, you may have run into the file descriptor limit for your Node.js process.

In most operating systems, each socket connection is associated with a file descriptor. Many operating systems have a limit on how many such file descriptors can be used by a single process.

The way to fix this issue is to increase the number of file descriptors for the Node.js process. On Mac OS and Linux you do this using the `ulimit` method.

```
ulimit -n 6000
```

This sets the maximum number of file descriptors for the process to 6000, allowing Node.js to connect with a pool size of 5000 sockets.

# How can I prevent a slow operation from delaying other operations?

While Node.js is asynchronous, MongoDB is not. Currently, MongoDB uses a single execution thread per socket. This means that it will only execute a single operation on a socket at any given point in time. Any other operations sent to that socket will have to wait until the current operation is finished. If you have a slow-running operation which holds up other operations,
the best solution is to create a separate connection pool for the slow operation, isolating it from other, faster
operations.
