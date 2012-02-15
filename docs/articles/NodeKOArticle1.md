# A Basic introduction to Mongo DB
Mongo DB has rapidly grown to become a popular database for web applications and is a perfect fit for Node.JS applications, letting you write Javascript for the client, backend and database layer. It's schemaless nature is a better match to our constantly evolving data structures in web applications and the integrated support for location queries a bonus that it's hard to ignore. Throw Replicasets for scaling and we are looking at really nice platform to grow your storage needs now and in the future.

Now to shamelessly plug my driver. It can be downloaded either using npm or fetched from the github repository. To install via npm do the following.

`npm install mongodb`

or go fetch it from github at [https://github.com/christkv/node-mongodb-native](https://github.com/christkv/node-mongodb-native)

Once this business is taken care of let's move through the types available for the driver and then how to connect to your Mongo DB instance before facing the usage of some crud operations.

## Mongo DB data types
So there is an important thing to keep in mind when working with Mongo DB and that is that there is a slight mapping difference between the types supported in Mongo DB and what is native types in Javascript. Let's have a look at the types supported out of the box and then how types are promoted by the driver to try to fit as close to the native Javascript types as possible.

* **Float** is a 8 byte and is directly convertible to the Javascript type Number
* **Double class** a special class representing a float value, this is especially useful when using capped collections where you need to ensure your values are always floats.
* **Integers** is a bit trickier due to the fact that Javascript represents all Numbers as 64 bit floats meaning that the maximum integer value is at a 53 bit. Mongo has two types for integers, a 32 bit and a 64 bit. The driver will try to fit the value into 32 bits if it can and promote it to 64 bits if it has to. Similarly it will deserialize attempting to fit it into 53 bits if it can. If it cannot it will return an instance of **Long** to avoid loosing precession.
* **Long class** a special class that let's you store 64 bit integers and also let's you operate on the 64 bits integers.
* **Date** maps directly to a Javascript Date
* **RegEp** maps directly to a Javascript RegExp
* **String** maps directly to a Javascript String (encoded in utf8)
* **Binary class** a special class that let's you store data in Mongo DB
* **Code class** a special class that let's you store javascript functions in Mongo DB, can also provide a scope to run the method in
* **ObjectID class** a special class that holds a MongoDB document identifier (the equivalent to a Primary key)
* **DbRef class** a special class that let's you include a reference in a document pointing to another object
* **Symbol class** a special class that let's you specify a symbol, not really relevant for javascript but for languages that supports the concept of symbols.

As we see the number type can be a little tricky due to the way integers are implemented in Javascript. The latest driver will do correct conversion up to 53 bit's of complexity. If you need to handle big integers the recommendation is to use the Long class to operate on the numbers.

## Getting that connection to the database
Let's get around to setting up a connection with the Mongo DB database. Jumping straight into the code let's do direct connection and then look at the code.
 
    var mongo = require('mongodb'),
      Server = mongo.Server,
      Db = mongo.Db;
	
    var server = new Server('localhost', 27017, {auto_reconnect: true});
    var db = new Db('exampleDb', server);

    db.open(function(err, db) {
      if(!err) {
        console.log("We are connected");
      }
    });

Let's have a quick look at the simple connection. The **new Server(...)** sets up a configuration for the connection and the **auto_reconnect** tells the driver to retry sending a command to the server if there is a failure. Another option you can set is **poolSize**, this allows you to control how many tcp connections are opened in parallel. The default value for this is 1 but you can set it as high as you want. The driver will use a round-robin strategy to dispatch and read from the tcp connection.

We are up and running with a connection to the database. Let's move on and look at what collections are and how they work.

## Mongo DB and Collections
Collections are the equivalent of tables in traditional databases and contain all your documents. A database can have many collections. So how do we go about defining and using collections. Well there are a couple of methods that we can use. Let's jump straight into code and then look at the code.

**the requires and and other initializing stuff omitted for brevity**

    db.open(function(err, db) {
      if(!err) {
        db.collection('test', function(err, collection) {});

        db.collection('test', {safe:true}, function(err, collection) {});

        db.createCollection('test', function(err, collection) {});

        db.createCollection('test', {safe:true}, function(err, collection) {});
      }
    });  

Three different ways of creating a collection object but slightly different in behavior. Let's go through them and see what they do

    db.collection('test', function(err, collection) {});
 
This function will not actually create a collection on the database until you actually insert the first document.

    db.collection('test', {safe:true}, function(err, collection) {});

Notice the **{safe:true}** option. This option will make the driver check if the collection exists and issue an error if it does not.

    db.createCollection('test', function(err, collection) {});

This command will create the collection on the Mongo DB database before returning the collection object. If the collection already exists it will ignore the creation of the collection.

    db.createCollection('test', {safe:true}, function(err, collection) {});

The **{safe:true}** option will make the method return an error if the collection already exists.

With an open db connection and a collection defined we are ready to do some CRUD operation on the data.

## And then there was CRUD

So let's get dirty with the basic operations for Mongo DB. The Mongo DB wire protocol is built around 4 main operations **insert/update/remove/query**. Most operations on the database are actually queries with special json objects defining the operation on the database. But I'm getting ahead of myself. Let's go back and look at insert first and do it with some code.

**the requires and and other initializing stuff omitted for brevity**

    db.open(function(err, db) {
      if(!err) {
        db.collection('test', function(err, collection) {
          var doc1 = {'hello':'doc1'};
          var doc2 = {'hello':'doc2'};
          var lotsOfDocs = [{'hello':'doc3'}, {'hello':'doc4'}];

          collection.insert(doc1);

          collection.insert(doc2, {safe:true}, function(err, result) {});

          collection.insert(lotsOfDocs, {safe:true}, function(err, result) {});
        });
      }
    });

A couple of variations on the theme of inserting a document as we can see. To understand why it's important to understand how Mongo DB works during inserts of documents.

Mongo DB has asynchronous **insert/update/remove** operations. This means that when you issue an **insert** operation its a fire and forget operation where the database does not reply with the status of the insert operation. To retrieve the status of the operation you have to issue a query to retrieve the last error status of the connection. To make it simpler to the developer the driver implements the **{safe:true}** options so that this is done automatically when inserting the document. **{safe:true}** becomes especially important when you do **update** or **remove** as otherwise it's not possible to determine the amount of documents modified or removed.

Now let's go through the different types of inserts shown in the code above.

    collection.insert(doc1);

Taking advantage of the async behavior and not needing confirmation about the persisting of the data to Mongo DB we just fire off the insert (we are doing live analytics, loosing a couple of records does not matter).

    collection.insert(doc2, {safe:true}, function(err, result) {});

That document needs to stick. Using the **{safe:true}** option ensure you get the error back if the document fails to insert correctly.

    collection.insert(lotsOfDocs, {safe:true}, function(err, result) {});

A batch insert of document with any errors being reported. This is much more efficient if you need to insert large batches of documents as you incur a lot less overhead.

Right that's the basics of insert's ironed out. We got some documents in there but want to update them as we need to change the content of a field. Let's have a look at a simple example and then we will dive into how Mongo DB updates work and how to do them efficiently.

**the requires and and other initializing stuff omitted for brevity**

    db.open(function(err, db) {
      if(!err) {
        db.collection('test', function(err, collection) {
          var doc = {mykey:1, fieldtoupdate:1};

          collection.insert(doc, {safe:true}, function(err, result) {
            collection.update({mykey:1}, {$set:{fieldtoupdate:2}}, {safe:true}, function(err, result) {});      
          });

          var doc2 = {mykey:2, docs:[{doc1:1}]};
		
          collection.insert(doc2, {safe:true}, function(err, result) {
            collection.update({mykey:2}, {$push:{docs:{doc2:1}}, {safe:true}, function(err, result) {});
          });
        });
      };
    });

Alright before we look at the code we want to understand how document updates work and how to do the efficiently. The most basic and less efficient way is to replace the whole document, this is not really the way to go if you want to change just a field in your document. Luckily Mongo DB provides a whole set of operations that let you modify just pieces of the document [Atomic operations documentation](http://www.mongodb.org/display/DOCS/Atomic+Operations). Basically outlined below.

* $inc - increment a particular value by a certain amount
* $set - set a particular value
* $unset - delete a particular field (v1.3+)
* $push - append a value to an array
* $pushAll - append several values to an array
* $addToSet - adds value to the array only if its not in the array already
* $pop - removes the last element in an array
* $pull - remove a value(s) from an existing array
* $pullAll - remove several value(s) from an existing array
* $rename - renames the field
* $bit - bitwise operations

Now that the operations are outline let's dig into the specific cases show in the code example.

    collection.update({mykey:1}, {$set:{fieldtoupdate:2}}, {safe:true}, function(err, result) {});

Right so this update will look for the document that has a field **mykey** equal to **1** and apply an update to the field **fieldtoupdate** setting the value to **2**. Since we are using the **{safe:true}** option the result parameter in the callback will return the value **1** indicating that 1 document was modified by the update statement.

    collection.update({mykey:2}, {$push:{docs:{doc2:1}}, {safe:true}, function(err, result) {});

This updates adds another document to the field **docs** in the document identified by **{mykey:2}** using the atomic operation **$push**. This allows you to modify keep such structures as queues in Mongo DB.

Let's have a look at the remove operation for the driver. As before let's start with a piece of code.

**the requires and and other initializing stuff omitted for brevity**

    db.open(function(err, db) {
      if(!err) {
        db.collection('test', function(err, collection) {
          var docs = [{mykey:1}, {mykey:2}, {mykey:3}];

          collection.insert(docs, {safe:true}, function(err, result) {

            collection.remove({mykey:1});

            collection.remove({mykey:2}, {safe:true}, function(err, result) {});

            collection.remove();
          });
        });
      };
    });

Let's examine the 3 remove variants and what they do.

    collection.remove({mykey:1});

This leverages the fact that Mongo DB is asynchronous and that it does not return a result for **insert/update/remove** to allow for **synchronous** style execution. This particular remove query will remove the document where **mykey** equals **1**.

    collection.remove({mykey:2}, {safe:true}, function(err, result) {});

This remove statement removes the document where **mykey** equals **2** but since we are using **{safe:true}** it will back to Mongo DB to get the status of the remove operation and return the number of documents removed in the result variable.

    collection.remove();

This last one will remove all documents in the collection.

## Time to Query
Queries is of course a fundamental part of interacting with a database and Mongo DB is no exception. Fortunately for us it has a rich query interface with cursors and close to SQL concepts for slicing and dicing your datasets. To build queries we have lots of operators to choose from [Mongo DB advanced queries](http://www.mongodb.org/display/DOCS/Advanced+Queries). There are literarily tons of ways to search and ways to limit the query. Let's look at some simple code for dealing with queries in different ways.

**the requires and and other initializing stuff omitted for brevity**

    db.open(function(err, db) {
      if(!err) {
        db.collection('test', function(err, collection) {
          var docs = [{mykey:1}, {mykey:2}, {mykey:3}];

          collection.insert(docs, {safe:true}, function(err, result) {

            collection.find().toArray(function(err, items) {});

            var stream = collection.find({mykey:{$ne:2}}).streamRecords();
            stream.on("data", function(item) {});
            stream.on("end", function() {});

            collection.findOne({mykey:1}, function(err, item) {});

          });
        });
      };
    });

Before we start picking apart the code there is one thing that needs to be understood, the **find** method does not execute the actual query. It builds an instance of **Cursor** that you then use to retrieve the data. This lets you manage how you retrieve the data from Mongo DB and keeps state about your current Cursor state on Mongo DB. Now let's pick apart the queries we have here and look at what they do. 

    collection.find().toArray(function(err, items) {});

This query will fetch all the document in the collection and return them as an array of items. Be careful with the function **toArray** as it might cause a lot of memory usage as it will instantiate all the document into memory before returning the final array of items. If you have a big resultset you could run into memory issues.

    var stream = collection.find({mykey:{$ne:2}}).streamRecords();
    stream.on("data", function(item) {});
    stream.on("end", function() {});

This is the preferred way if you have to retrieve a lot of data for streaming, as data is deserialized a **data** event is emitted. This keeps the resident memory usage low as the documents are streamed to you. Very useful if you are pushing documents out via websockets or some other streaming socket protocol. Once there is no more document the driver will emit the **end** event to notify the application that it's done.

    collection.findOne({mykey:1}, function(err, item) {});

This is special supported function to retrieve just one specific document bypassing the need for a cursor object.

That's pretty much it for the quick intro on how to use the database. I have also included a list of links to where to go to find more information and also a sample crude location application I wrote using express JS and mongo DB.

## Links and stuff
* [The driver examples, good starting point for basic usage](https://github.com/christkv/node-mongodb-native/tree/master/examples)
* [All the integration tests, they have tons of different usage cases](https://github.com/christkv/node-mongodb-native/tree/master/test)
* [The Mongo DB wiki pages such as the advanced query link](http://www.mongodb.org/display/DOCS/Advanced+Queries)
* [A silly simple location based application using Express JS and Mongo DB](https://github.com/christkv/mongodb-hamburg)
























