+++
date = "2015-03-19T14:27:51-04:00"
title = "GridStore"
[menu.main]
  parent = "GridFS"
  identifier = "GridStore"
  weight = 20
  pre = "<i class='fa'></i>"
+++



## GridFS

GridFS is a specification for storing and retrieving files that exceed the BSON-document size limit of 16MB.

Instead of storing a file in a single document, GridFS divides a file into parts, or chunks, and stores each of those chunks as a separate document. By default GridFS limits chunk size to 255k. GridFS uses two collections to store files. The chunks collection stores the file chunks, and the files collection stores the file metadata.

When you query a GridFS store for a file, the driver or client will reassemble the chunks as needed. GridFS is useful not only for storing files that exceed 16MB but also for storing any files for which you want access without having to load the entire file into memory.

{{% note %}}
For more information about GridFS see the [MongoDB GridFS documentation](http://docs.mongodb.org/manual/core/gridfs/).
{{% /note %}}

GridStore is a single file inside GridFS that can be managed by the script.

## Open a GridFS file

Opening a GridStore (a single file in GridFS) is a bit similar to opening a database. At first you need to create a GridStore object and then `open` it. 

```js
var gs = new GridStore(db, filename, mode[, options])
```

Where

  * `db` is the database object
  * `filename` is the name of the file in GridFS that needs to be accessed/created
  * `mode` indicated the operation, can be one of:
    * "r" (Read): Looks for the file information in fs.files collection, or creates a new id for this object. 
    * "w" (Write): Erases all chunks if the file already exist. 
  * `options` can be used to specify some metadata for the file, for example `content_type`, `metadata` and `chunk_size`

Example:

```js
var gs = new GridStore(db, "test.png", "w", {
  "content_type": "image/png",
  "metadata":{
      "author": "Daniel"
  },
  "chunk_size": 1024*4
});
```

After a GridStore object is created, it needs to be opened.

```js
gs.open(function(err, gs) {
  // gs is the intialized GridStore object
});
```
    
Opened GridStore objects have a set of useful exposed properties

  * `gs.length` - length of the file in bytes
  * `gs.contentType` - the content type for the file
  * `gs.uploadDate` - when the file was uploaded
  * `gs.metadata` - metadata that was saved with the file
  * `gs.chunkSize` - chunk size

Example

```js
gs.open(function(err, gs){
  console.log("this file was uploaded at "+gs.uploadDate);
});
```

## Writing to GridFS

Writing can be done with `write`

```js
gs.write(data, callback)
```
    
where `data` is a `Buffer` or a string, callback gets two parameters - an error object (if error occured) and result value which indicates if the write was successful or not.

While the GridStore is not closed, every write is appended to the opened GridStore.

## Writing a file to GridFS

This function opens the GridStore, streams the contents of the file into GridStore, and closes the GridStore.

```js
gs.writeFile( file, callback )
```
    
where

  * `file` is a file descriptor, or a string file path
  * `callback` is a function with two parameters - error object (if error occured) and the GridStore object.

## Reading from a GridFS file

Reading from GridStore can be done with `read`

```js
gs.read([size], callback)
```

where

  * `size` is the length of the data to be read
  * `callback` is a callback function with two parameters - error object (if an error occured) and data (binary string)

## Streaming from GridFS

You can stream data as it comes from the database using `stream`

```js
gs.stream()
```
    
The function returns [read stream](http://nodejs.org/docs/v0.4.12/api/streams.html#readable_Stream) based on this GridStore file. It supports the events 'read', 'error', 'close' and 'end'.

## Delete a GridFS file

GridStore files can be unlinked with `unlink`

```js
GridStore.unlink(db, name, callback)
```

Where

  * `db` is the database object
  * `name` is either the name of a GridStore object or an array of GridStore object names
  * `callback` is the callback function

## Closing a GridFS file

GridStore needs to be closed after usage. This can be done with `close`

```js
gs.close(callback)
```
    
## Check if a GridFS file exists

Checking if a file exists in GridFS can be done with `exist`

```js
GridStore.exist(db, filename, callback)
```
    
Where

  * `db` is the database object
  * `filename` is the name of the file to be checked or a regular expression
  * `callback` is a callback function with two parameters - an error object (if an error occured) and a boolean value indicating if the file exists or not
  
## Seek to a Specific position for Reading

Seeking can be done with `seek`

```js
gs.seek(position);
```

This function moves the internal pointer to the specified position.
