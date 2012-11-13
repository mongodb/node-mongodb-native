# MongoClient or how to connect in a new and better way
From driver version **1.2** we are introduction a new connection Class that has the same name across all out offical drivers. 
This is to ensure that we present a recognizable front for all our API's. This does not mean you existing application will break
but that we encourage you to use the new connection api to simplifiy your application development.

Futher more we are making the new connection class **MongoClient** acknowledge all write to MongoDB in contrast to the existing
conncetion class Db that has acknowledgements turned off. Let's take a tour of the MongoClient functions.

    MongoClient = function(server, options);

    MongoClient.prototype.open

    MongoClient.prototype.close

    MongoClient.prototype.db

    MongoClient.connect

  Outlined above is the complete MongoClient interface. The methods **open**, **close** and **db** work very similar to the existing
  methods on the **Db** class. The main difference if you noticed is that the constructor is missing the **database name** from Db.
  Let's show a simple connection using **open** as a code example speaks a thousand words.

    var MongoClient = require('mongodb').MongoClient
      , Server = require('mongodb').Server;

    var mongoClient = new MongoClient(new Server('localhost', 27017));
    mongoClient.open(function(err, mongoClient) {
      var db1 = mongoClient.db("mydb");

      mongoClient.close();
    });

Notice that you configure the MongoClient just as you would have done the Db object. The main difference is that you access the db instances
using the **db** method on the MongoClient object instead of using the Db instance directly as you would previously. Don't that seem more
intuitive then the previous API. Also MongoClient supports the same options as the previous Db instance you would have created.

So with a minimal change in our app we can apply the new MongoClient connection code. But there is more and one direction you might consider 
int the future. That is the mongodb connection string.

## The URL connection format

    mongodb://[username:password@]host1[:port1][,host2[:port2],...[,hostN[:portN]]][/[database][?options]]

The URL format is unified across official drivers from 10gen with some options not supported on some driver due to natural reasons. The ones 
not supported by the Node.js driver are left out for simplicities sake.

### Basic parts of the url 
  * **mongodb://** is a required prefix to identify that this is a string in the standard connection format.

  * **username:password@** are optional. If given, the driver will attempt to login to a database after connecting to a database server.
  * **host1** is the only required part of the URI. It identifies either a hostname, IP address, or unix domain socket
  * **:portX** is optional and defaults to :27017 if not provided.
  * **/database** is the name of the database to login to and thus is only relevant if the username:password@ syntax is used. If not specified the "admin" database will be used by default.
  * **?options** are connection options. Note that if database is absent there is still a / required between the last host and the ? introducing the options. Options are name=value pairs and the pairs are separated by "&". For any unrecognized or unsupported option, a driver should log a warning and continue processing. A driver should not support any options that are not exclicitly defined in this specification. This is in order to reduce the likelihood that different drivers will support overlapping that differ in small but incompatible ways (like different name, different values, or different default value).

### Replica set configuration:
* **replicaSet=name**
    * The driver verifies that the name of the replica set it connects to matches this name. Implies that the hosts given are a seed list, and the driver will attempt to find all members of the set.
    * No default value.

### Connection Configuration:
* **ssl=true|false|prefer**
    * true: the driver initiates each connections with SSL
    * false: the driver initiates each connection without SSL
    * prefer: the driver tries to initiate each connection with SSL, and falls back to without SSL if it fails.
    * Default value is false.

* **connectTimeoutMS=ms**
    * How long a connection can take to be opened before timing out.
    * Current driver behavior already differs on this, so default must be left to each driver. For new implementations, the default should be to never timeout.

* **socketTimeoutMS=ms**
    * How long a send or receive on a socket can take before timing out.
    * Current driver behavior already differs on this, so default must be left to each driver. For new implementations, the default should be to never timeout.

### Connection pool configuration:
* **maxPoolSize=n:** The maximum number of connections in the connection pool
    * Default value is 100

### Write concern configuration:
* **w=wValue**
    * For numeric values above 1, the driver adds { w : wValue } to the getLastError command.
    * wValue is typically a number, but can be any string in order to allow for specifications like "majority"
    * Default value is 1.
    * If wValue == -1 ignore network errors
    * If wValue == 0 Don't send getLastError
    * If wValue == 1 send {getlasterror: 1} (no w)

* **wtimeoutMS=ms**
    * The driver adds { wtimeout : ms } to the getlasterror command.
    * Used in combination with w
    * No default value

* **journal=true|false**
    * true: Sync to journal.
    * false: the driver does not add j to the getlasterror command
    * Default value is false

* **fsync=true|false**
    * true: Sync to disk.
    * false: the driver does not add fsync to the getlasterror command
    * Default value is false
    * If conflicting values for fireAndForget, and any write concern are passed the driver should raise an exception about the conflict.

### Read Preference
* **slaveOk=true|false:** Whether a driver connected to a replica set will send reads to slaves/secondaries.
    * Default value is false

* **readPreference=enum:** The read preference for this connection. If set, it overrides any slaveOk value.
    * Enumerated values:
      * primary
      * primaryPreferred
      * secondary
      * secondaryPreferred
      * nearest
    * Default value is primary

* **readPreferenceTags=string.** A representation of a tag set as a comma-separated list of colon-separated key-value pairs, e.g. **dc:ny,rack:1**. Spaces should be stripped from beginning and end of all keys and values. To specify a list of tag sets, using multiple readPreferenceTags, e.g. **readPreferenceTags=dc:ny,rack:1&readPreferenceTags=dc:ny&readPreferenceTags=**
    * Note the empty value, it provides for fallback to any other secondary server if none is available
    * Order matters when using multiple readPreferenceTags
    * There is no default value

## MongoClient.connect
The url format can be used with MongoClient.connect. Where possible MongoClient will pick the best possible default values for options but they
can be overriden. This includes setting **auto_reconnect to true** and **native_parser to true if it's available**. Below are some example on how
to connect to a single server a replicaset and a sharded system using **MongoClient.connect**

### The single server connection

    var MongoClient = require('mongodb').MongoClient;

    MongoClient.connect("mongodb://localhost:27017/integration_test", function(err, db) {
      test.equal(null, err);
      test.ok(db != null);

      db.collection("replicaset_mongo_client_collection").update({a:1}, {b:1}, {upsert:true}, function(err, result) {
        test.equal(null, err);
        test.equal(1, result);

        db.close();
        test.done();
      });
    });


### A replicaset connect using no ackowledgment by default and readPreference for secondary
  
    var MongoClient = require('mongodb').MongoClient;

    MongoClient.connect("mongodb://localhost:30000,localhost:30001/integration_test_?w=0&readPreference=secondary", function(err, db) {
      test.equal(null, err);
      test.ok(db != null);

      db.collection("replicaset_mongo_client_collection").update({a:1}, {b:1}, {upsert:true}, function(err, result) {
        test.equal(null, err);
        test.equal(1, result);

        db.close();
        test.done();
      });
    });

### A sharded connect using no ackowledgment by default and readPreference for secondary
  
    var MongoClient = require('mongodb').MongoClient;

    MongoClient.connect("mongodb://localhost:50000,localhost:50001/integration_test_?w=0&readPreference=secondary", function(err, db) {
      test.equal(null, err);
      test.ok(db != null);

      db.collection("replicaset_mongo_client_collection").update({a:1}, {b:1}, {upsert:true}, function(err, result) {
        test.equal(null, err);
        test.equal(1, result);

        db.close();
        test.done();
      });
    });

Notice that when connecting to the shareded system it's pretty much the same url as for connecting to the replicaset. This is because the driver
itself figures out if it's a replicaset or a set of Mongos proxies it's connecting to.
