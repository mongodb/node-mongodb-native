---
aliases:
- /doc/installing/
date: 2013-07-01
menu:
  main:
    parent: getting started
next: /overview/introduction
prev: /overview/installing
title: QuickStart
weight: 20
---

QuickStart
==========
The quickstart guide will show you how to set up a simple application using Core driver and MongoDB. It scope is only how to set up the driver and perform the simple crud operations. For more inn depth coverage we encourage reading the tutorials.

Create the package.json file
----------------------------
Let's create a directory where our application will live. In our case we will put this under our projects directory.

```
mkdir myproject
cd myproject
```

Create a **package.json** using your favorite text editor and fill it in.

```json
{
  "name": "myproject",
  "version": "1.0.0",
  "description": "My first project",
  "main": "index.js",
  "repository": {
    "type": "git",
    "url": "git://github.com/christkv/myfirstproject.git"
  },
  "dependencies": {
    "mongodb-core": "~1.0"
  },
  "author": "Christian Kvalheim",
  "license": "Apache 2.0",
  "bugs": {
    "url": "https://github.com/christkv/myfirstproject/issues"
  },
  "homepage": "https://github.com/christkv/myfirstproject"
}
```

Save the file and return to the shell or command prompt and use **NPM** to install all the dependencies.

```
npm install
```

You should see **NPM** download a lot of files. Once it's done you'll find all the downloaded packages under the **node_modules** directory.

Booting up a MongoDB Server
---------------------------
Let's boot up a MongoDB server instance. Download the right MongoDB version from [MongoDB](http://www.mongodb.org), open a new shell or command line and ensure the **mongod** command is in the shell or command line path. Now let's create a database directory (in our case under **/data**).

```
mongod --dbpath=/data --port 27017
```

You should see the **mongod** process start up and print some status information.

Connecting to MongoDB
---------------------
Let's create a new **app.js** file that we will use to show the basic CRUD operations using the MongoDB driver.

First let's add code to connect to the server. Notice that there is no concept of a database here and we use the topology directly to perform the connection.

```js
var Server = require('mongodb-core').Server
  , assert = require('assert');

// Set up server connection
var server = new Server({
    host: 'localhost'
  , port: 27017
  , reconnect: true
  , reconnectInterval: 50
});

// Add event listeners
server.on('connect', function(_server) {
  console.log('connected');
  test.done();
});

server.on('close', function() {
  console.log('closed');
});

server.on('reconnect', function() {
  console.log('reconnect');
});

// Start connection
server.connect();
```

To connect to a replicaset we would use the `ReplSet` class and for a set of Mongos proxies we use the `Mongos` class. Each topology class offer the same CRUD operations and you operate on the topology directly. Let's look at an example exercising all the different available CRUD operations.

```js
var Server = require('mongodb-core').Server
  , assert = require('assert');

// Set up server connection
var server = new Server({
    host: 'localhost'
  , port: 27017
  , reconnect: true
  , reconnectInterval: 50
});

// Add event listeners
server.on('connect', function(_server) {
  console.log('connected');

  // Execute the ismaster command
  _server.command('system.$cmd', {ismaster: true}, function(err, result) {

    // Perform a document insert
    _server.insert('myproject.inserts1', [{a:1}], {
      writeConcern: {w:1}, ordered:true
    }, function(err, results) {
      assert.equal(null, err);

      // Perform a document update
      
    });

    test.done();
  });
});

server.on('close', function() {
  console.log('closed');
});

server.on('reconnect', function() {
  console.log('reconnect');
});

// Start connection
server.connect();
```



