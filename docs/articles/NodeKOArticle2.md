# A primer for GridFS using the Mongo DB driver
In the first tutorial we targeted general usage of the database. But Mongo DB is much more than this. One of the additional very useful features is to act as a file storage system. This is accomplish in Mongo by having a file collection and a chunks collection where each document in the chunks collection makes up a **Block** of the file. In this tutorial we will look at how to use the GridFS functionality and what functions are available.

## A simple example
Let's dive straight into a simple example on how to write a file to the grid using the simplified Grid class.

    var mongo = require('mongodb'),
      Server = mongo.Server,
      Db = mongo.Db,
	Grid = mongo.Grid;
	
    var server = new Server('localhost', 27017, {auto_reconnect: true});
    var db = new Db('exampleDb', server);

    db.open(function(err, db) {
      if(!err) {
        var grid = new Grid(db, 'fs');    
        var buffer = new Buffer("Hello world");
        grid.put.(buffer, {metadata:{category:'text'}, content_type: 'text'}, function(err, fileInfo) {
          if(!err) {
            console.log("Finished writing file to Mongo");
          }
        });
      }
    });
    
All right let's dissect the example. The first thing you'll notice is the statement

    var grid = new Grid(db, 'fs');

Since GridFS is actually a special structure stored as collections you'll notice that we are using the db connection that we used in the previous tutorial to operate on collections and documents. The second parameter **'fs'** allows you to change the collections you want to store the data in. In this example the collections would be **fs_files** and **fs_chunks**.

Having a life grid instance we now go ahead and create some test data stored in a Buffer instance, although you can pass in a string instead. We then write our data to disk.

    var buffer = new Buffer("Hello world");
    grid.put.(buffer, {metadata:{category:'text'}, content_type: 'text'}, function(err, fileInfo) {
      if(!err) {
        console.log("Finished writing file to Mongo");
      }
    });

Let's deconstruct the call we just made. The **put** call will write the data you passed in as one or more chunks. The second parameter is a hash of options for the Grid class. In this case we wish to annotate the file we are writing to Mongo DB with some metadata and also specify a content type. Each file entry in GridFS has support for metadata documents which might be very useful if you are for example storing images in you Mongo DB and need to store all the data associated with the image.

One important thing is to take not that the put method return a document containing a **_id**, this is an **ObjectID** identifier that you'll need to use if you wish to retrieve the file contents later.

Right so we have written out first file, let's look at the other two simple functions supported by the Grid class.

**the requires and and other initializing stuff omitted for brevity**
    
    db.open(function(err, db) {
      if(!err) {
        var grid = new Grid(db, 'fs');    
        var buffer = new Buffer("Hello world");
        grid.put.(buffer, {metadata:{category:'text'}, content_type: 'text'}, function(err, fileInfo) {        
          grid.get(fileInfo._id, function(err, data) {
            console.log("Retrieved data: " + data.toString());
            grid.delete(fileInfo._id, function(err, result) {
            });        
          });
        });
      }
    });

Let's have a look at the two operations **get** and **delete**

    grid.get(fileInfo._id, function(err, data) {});

The **get** method takes an ObjectID as the first argument and as we can se in the code we are using the one provided in **fileInfo._id**. This will read all the chunks for the file and return it as a Buffer object.

The **delete** method also takes an ObjectID as the first argument but will delete the file entry and the chunks associated with the file in Mongo.

This **api** is the simplest one you can use to interact with GridFS but it's not suitable for all kinds of files. One of it's main drawbacks is you are trying to write large files to Mongo. This api will require you to read the entire file into memory when writing and reading from Mongo which most likely is not feasible if you have to store large files like Video or RAW Pictures. Luckily this is not the only way to work with GridFS. That's not to say this api is not useful. If you are storing tons of small files the memory usage vs the simplicity might be a worthwhile tradeoff. Let's dive into some of the more advanced ways of using GridFS.

## Advanced GridFS or how not to run out of memory
As we just said controlling memory consumption for you file writing and reading is key if you want to scale up the application. That means not reading in entire files before either writing or reading from Mongo DB. The good news it's supported. Let's throw some code out there straight away and look at how to do chunk sized streaming writes and reads.

**the requires and and other initializing stuff omitted for brevity**

    var fileId = new ObjectID();
    var gridStore = new GridStore(db, fileId, "w", {root:'fs'});
    gridStore.chunkSize = 1024 * 256;

    gridStore.open(function(err, gridStore) {
     Step(
       function writeData() {
         var group = this.group();
   
         for(var i = 0; i < 1000000; i += 5000) {
           gridStore.write(new Buffer(5000), group());
         }   
       },
   
       function doneWithWrite() {
         gridStore.close(function(err, result) {
           console.log("File has been written to GridFS");
         });
       }
     )
    });

Before we jump into picking apart the code let's look at

    var gridStore = new GridStore(db, fileId, "w", {root:'fs'});

Notice the parameter **"w"** this is important. It tells the driver that you are planning to write a new file. The parameters you can use here are.

 * **"r"** - read only. This is the default mode
 * **"w"** - write in truncate mode. Existing data will be overwritten
 * **"w+"** - write in edit mode

Right so there is a fair bit to digest here. We are simulating writing a file that's about 1MB big to  Mongo DB using GridFS. To do this we are writing it in chunks of 5000 bytes. So to not live with a difficult callback setup we are using the Step library with its' group functionality to ensure that we are notified when all of the writes are done. After all the writes are done Step will invoke the next function (or step) called **doneWithWrite** where we finish up by closing the file that flushes out any remaining data to Mongo DB and updates the file document.

As we are doing it in chunks of 5000 bytes we will notice that memory consumption is low. This is the trick to write large files to GridFS. In pieces. Also notice this line.

    gridStore.chunkSize = 1024 * 256;

This allows you to adjust how big the chunks are in bytes that Mongo DB will write. You can tune the Chunk Size to your needs. If you need to write large files to GridFS it might be worthwhile to trade of memory for CPU by setting a larger Chunk Size.

Now let's see how the actual streaming read works.

    var gridStore = new GridStore(db, fileId, "r");
    gridStore.open(function(err, gridStore) {
      var stream = gridStore.stream(true);

      stream.on("data", function(chunk) {
        console.log("Chunk of file data");
      });

      stream.on("end", function() {
        console.log("EOF of file");
      });

      stream.on("close", function() {
        console.log("Finished reading the file");
      });
    });

Right let's have a quick lock at the streaming functionality supplied with the driver **(make sure you are using 0.9.6-12 or higher as there is a bug fix for custom chunksizes that you need)**

    var stream = gridStore.stream(true);

This opens a stream to our file, you can pass in a boolean parameter to tell the driver to close the file automatically when it reaches the end. This will fire the **close** event automatically. Otherwise you'll have to handle cleanup when you receive the **end** event. Let's have a look at the events supported.

      stream.on("data", function(chunk) {
        console.log("Chunk of file data");
      });

The **data** event is called for each chunk read. This means that it's by the chunk size of the written file. So if you file is 1MB big and the file has chunkSize 256K then you'll get 4 calls to the event handler for **data**. The chunk returned is a **Buffer** object.

      stream.on("end", function() {
        console.log("EOF of file");
      });

The **end** event is called when the driver reaches the end of data for the file.

      stream.on("close", function() {
        console.log("Finished reading the file");
      });

The **close** event is only called if you the **autoclose** parameter on the **gridStore.stream** method as shown above. If it's false or not set handle cleanup of the streaming in the **end** event handler.

Right that's it for writing to GridFS in an efficient Manner. I'll outline some other useful function on the Gridstore object.

## Other useful methods on the Gridstore object
There are some other methods that are useful

    gridStore.writeFile(filename/filedescriptor, function(err fileInfo) {});

**writeFile** takes either a file name or a file descriptor and writes it to GridFS. It does this in chunks to ensure the Eventloop is not tied up.

    gridStore.read(length, function(err, data) {});

**read/readBuffer** lets you read a #length number of bytes from the current position in the file.

    gridStore.seek(position, seekLocation, function(err, gridStore) {});

**seek** lets you navigate the file to read from different positions inside the chunks. The seekLocation allows you to specify how to seek. It can be one of three values.

* GridStore.IO_SEEK_SET Seek mode where the given length is absolute
* GridStore.IO_SEEK_CUR Seek mode where the given length is an offset to the current read/write head
* GridStore.IO_SEEK_END Seek mode where the given length is an offset to the end of the file

    GridStore.list(dbInstance, collectionName, {id:true}, function(err, files) {})

**list** lists all the files in the collection in GridFS. If you have a lot of files the current version will not work very well as it's getting all files into memory first. You can have it return either the filenames or the ids for the files using option.

    gridStore.unlink(function(err, result) {});

**unlink** deletes the file from Mongo DB, that's to say all the file info and all the chunks.

This should be plenty to get you on your way building your first GridFS based application. As in the previous article the following links might be useful for you. Good luck and have fun.

## Links and stuff
* [The driver examples, good starting point for basic usage](https://github.com/christkv/node-mongodb-native/tree/master/examples)
* [All the integration tests, they have tons of different usage cases](https://github.com/christkv/node-mongodb-native/tree/master/test)




