# Mongo Driver and Mongo DB 2.2 Features
For Mongo DB there are multiple new features and improvements in the driver. This include Mongos failover support, authentication, replicaset support, read preferences and aggregation. Let's move throught the different new features starting with.

## Read preferences
Read preferences is now backed by a specification and is more consistent across drivers. With read preferences you can control from where your Reads are happing in a Replicaset and from Mongo DB also in a shard. Let's go through the different types of read Preferences that are available and what they mean.

* **ReadPreference.PRIMARY:** Read from primary only. All operations produce an error (throw an exception where applicable) if primary is unavailable. Cannot be combined with tags **(This is the default.)**
* **ReadPreference.PRIMARY_PREFERRED:** Read from primary if available, otherwise a secondary.
* **ReadPreference.SECONDARY:** Read from secondary if available, otherwise error.
* **ReadPreference.SECONDARY_PREFERRED:** Read from a secondary if available, otherwise read from the primary.
* **ReadPreference.NEAREST:** All modes read from among the nearest candidates, but unlike other modes, NEAREST will include both the primary and all secondaries in the random selection. The name NEAREST is chosen to emphasize its use, when latency is most important. For I/O-bound users who want to distribute reads across all members evenly regardless of ping time, set secondaryAcceptableLatencyMS very high. See "Ping Times" below. **A strategy must be enabled on the ReplSet instance to use NEAREST as it requires intermittent setTimeout events, see Db class documentation**

Additionally you can now use tags with all the read preferences to actively choose specific sets of servers in a replicatset or sharded system located in different data centers. The rules are fairly simple as outline below. A server member matches a tag set if its tags match all the tags in the set. For example, a member tagged **{ dc: 'ny', rack: 2, size: 'large' }** matches the tag set **{ dc: 'ny', rack: 2 }**. A member's extra tags don't affect whether it's a match.

Using a read preference is very simple. Below are some examples using it at the db level, collection level and individual query level as well as an example using tags.

Below is a simple example using readpreferences at the db level.

    var mongo = require('mongodb'),
      ReplSet = mongo.ReplSet,
      ReadPreference = mongodb.ReadPreference,
      Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet( [
        new Server( "localhost", 27017, { auto_reconnect: true } ),
        new Server( "localhost", 27018, { auto_reconnect: true } ),
        new Server( "localhost", 27019, { auto_reconnect: true } )
      ], {rs_name: "foo"}
    );

    // Instantiate a new db object
    var db = new Db('exampleDb', replSet, {readPreference: ReadPreference.SECONDARY_PREFERRED});
    db.open(function(err, db) {
      if(!err) {
        console.log("We are connected");
      }
    });

Below is a simple example using readpreferences at the collection level.

    var mongo = require('mongodb'),
      ReplSet = mongo.ReplSet,
      ReadPreference = mongodb.ReadPreference,
      Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet( [
        new Server( "localhost", 27017, { auto_reconnect: true } ),
        new Server( "localhost", 27018, { auto_reconnect: true } ),
        new Server( "localhost", 27019, { auto_reconnect: true } )
      ], {rs_name: "foo"}
    );

    // Instantiate a new db object
    var db = new Db('exampleDb', replSet);
    db.open(function(err, db) {
      if(!err) {
        console.log("We are connected");

        var collection = db.collection('somecollection', {readPreference: ReadPreference.SECONDARY_PREFERRED});
        collection.find({}).toArray(function(err, items) {
          // Done reading from secondary if available
        })
      }
    });

Below is a simple example using readpreferences at the query level.

    var mongo = require('mongodb'),
      ReplSet = mongo.ReplSet,
      ReadPreference = mongodb.ReadPreference,
      Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet( [
        new Server( "localhost", 27017, { auto_reconnect: true } ),
        new Server( "localhost", 27018, { auto_reconnect: true } ),
        new Server( "localhost", 27019, { auto_reconnect: true } )
      ], {rs_name: "foo"}
    );

    // Instantiate a new db object
    var db = new Db('exampleDb', replSet);
    db.open(function(err, db) {
      if(!err) {
        console.log("We are connected");

        var collection = db.collection('somecollection');
        collection.find({}).setReadPreference(new ReadPreference(ReadPreference.SECONDARY_PREFERRED)).toArray(function(err, items) {
          // Done reading from secondary if available
        })
      }
    });

Below is a simple example using a readpreference with tags at the query level. This example will pick from the set of servers tagged with **dc1:ny**.

    var mongo = require('mongodb'),
      ReplSet = mongo.ReplSet,
      ReadPreference = mongodb.ReadPreference,
      Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet( [
        new Server( "localhost", 27017, { auto_reconnect: true } ),
        new Server( "localhost", 27018, { auto_reconnect: true } ),
        new Server( "localhost", 27019, { auto_reconnect: true } )
      ], {rs_name: "foo"}
    );

    // Instantiate a new db object
    var db = new Db('exampleDb', replSet);
    db.open(function(err, db) {
      if(!err) {
        console.log("We are connected");

        var collection = db.collection('somecollection');
        collection.find({}).setReadPreference(new ReadPreference(ReadPreference.SECONDARY_PREFERRED, {"dc1":"ny"})).toArray(function(err, items) {
          // Done reading from secondary if available
        })
      }
    });

## Mongos
There is now a seperate Server type for Mongos that handles not only Mongos read preferences for Mongo DB but also failover and picking the nearest Mongos proxy to your application. To use simply do

    var mongo = require('mongodb'),
      Mongos = mongo.Mongos,
      Db = mongo.Db;

    // Set up mongos connection
    var mongos = new Mongos([
        new Server("localhost", 50000, { auto_reconnect: true }),
        new Server("localhost", 50001, { auto_reconnect: true })
      ])

    // Instantiate a new db object
    var db = new Db('exampleDb', server);
    db.open(function(err, db) {
      if(!err) {
        console.log("We are connected");
      }
    });

Read preferences also work with Mongos from Mongo DB 2.2 or higher allowing you to create more complex deployment setups.

## Replicaset improvements and changes
Replicasets now return to the driver when a primary has been identified allowing for faster connect time meaning the application does not have to wait for the whole set to be identified before being able to run. That said any secondary queries using read preference **ReadPreference.SECONDARY** might fail until at least one secondary is up. To aid in development of layers above the driver now emits to new events.

* **open** is emitted when the driver is ready to be used.
* **fullsetup** is emitted once the whole replicaset is up and running

To ensure better control over timeouts when attempting to connect to replicaset members that might be down there is now two timeout settings.

* **connectTimeoutMS:** set the timeout for the intial connect to the mongod or mongos instance.
* **socketTimeoutMS:** set the timeout for established connections to the mongod or mongos instance.

## High availability "on" by default
The high availability code has been rewritten to run outside a setTimeout allowing for better control and handling. It's also on by default now. It can be disabled using the following settings on the ReplSet class.

 *  **ha** {Boolean, default:true}, turn on high availability.
 *  **haInterval** {Number, default:2000}, time between each replicaset status check.

 This allows the driver to discover new replicaset members or replicaset members who left the set and then returned.

## Better stream support for GridFS
GridFS now supports the streaming api's for node allowing you to pipe content either into or out of a Gridstore object making it easy to work with other streaming api's available.

A simple example is shown below for how to stream from a file on disk to a gridstore object.

    var mongo = require('mongodb'),
      fs = require('fs'),
      Server = mongo.Server,
      GridStore = mongo.GridStore,
      Db = mongo.Db;

    var db = new Db(new Server("localhost", 27017, {auto_reconnect:true}));
    db.open(function(err, client) {
      // Set up gridStore
      var gridStore = new GridStore(client, "test_stream_write", "w");
      // Create a file reader stream to an object
      var fileStream = fs.createReadStream("./test/gridstore/test_gs_working_field_read.pdf");
      gridStore.on("close", function(err) {
        // Just read the content and compare to the raw binary
        GridStore.read(client, "test_stream_write", function(err, gridData) {
          var fileData = fs.readFileSync("./test/gridstore/test_gs_working_field_read.pdf");
          test.deepEqual(fileData, gridData);
          test.done();
        })
      });

      // Pipe it through to the gridStore
      fileStream.pipe(gridStore);
    })

A simple example is shown below for how to stream from a gridfs file to a file on disk.

    var mongo = require('mongodb'),
      fs = require('fs'),
      Server = mongo.Server,
      GridStore = mongo.GridStore,
      Db = mongo.Db;

    var db = new Db(new Server("localhost", 27017, {auto_reconnect:true}));
    db.open(function(err, client) {
      // Set up gridStore
      var gridStore = new GridStore(client, "test_stream_write_2", "w");
      gridStore.writeFile("./test/gridstore/test_gs_working_field_read.pdf", function(err, result) {
        // Open a readable gridStore
        gridStore = new GridStore(client, "test_stream_write_2", "r");
        // Create a file write stream
        var fileStream = fs.createWriteStream("./test_stream_write_2.tmp");
        fileStream.on("close", function(err) {
          // Read the temp file and compare
          var compareData = fs.readFileSync("./test_stream_write_2.tmp");
          var originalData = fs.readFileSync("./test/gridstore/test_gs_working_field_read.pdf");
          test.deepEqual(originalData, compareData);
          test.done();
        })
        // Pipe out the data
        gridStore.pipe(fileStream);
      });
    })

## toBSON method
If in an object now has a toBSON function it will be called to for custom serialization of the object instance. This can be used to just serialize wanted fields. Deserializing is not affected by this and the application is responsible for deflating objects again.

A simple example below

    var customObject = {
        a:1
        b:2
        toBSON: function() {
          return {a:this.a}
        }
      }

## Other minor changes
* Connection pool is not set to 5 by default override if there is need for either a bigger or smaller pool pr node process.
* Gridfs now ensure an index on the chunks collection on file_id.








