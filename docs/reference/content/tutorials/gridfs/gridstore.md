+++
date = "2015-03-19T14:27:51-04:00"
title = "Legacy GridStore"
[menu.main]
  parent = "GridFS"
  identifier = "GridStore"
  weight = 20
  pre = "<i class='fa'></i>"
+++

{{% warning %}}
The GridStore API is deprecated. Driver version 2.0 and later uses the
[GridFS API]({{<relref "tutorials/gridfs/streaming.md">}}).

{{% /warning %}}

# GridStore

GridStore is a single file inside GridFS that can be managed by the script.

## Open a GridFS file

Opening a GridStore is similar to opening a database. First you create a GridStore object, then `open` it. 

```js
var gs = new GridStore(db, filename, mode[, options])
```

Where:

  * `db` is the database object
  * `filename` is the name of the file in GridFS that needs to be accessed/created
  * `mode` indicates the operation, can be one of:
    * "r" (Read): Looks for the file information in fs.files collection, or creates a new id for this object. 
    * "w" (Write): Erases all chunks if the file already exist. 
  * `options` can be used to specify metadata for the file, such as `content_type`, `metadata` and `chunk_size`

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

After a GridStore object is created, it can be opened.

```js
gs.open(function(err, gs) {
  // gs is the intialized GridStore object
});
```
    
Opened GridStore objects have a set of useful exposed properties:

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

Write to the GridStore object with the `write` function:

```js
gs.write(data, callback)
```
    
`data` is a `Buffer` or a string. Callback gets two parameters - an error object (if an error occured) and a
result value which indicates if the write was successful or not.

While the GridStore is not closed, every write is appended to the opened GridStore.

## Writing a file to GridFS

The `writeFile` function opens the GridStore, streams the contents of the file into GridStore, and closes the GridStore.

```js
gs.writeFile( file, callback )
```
    
where:

  * `file` is a file descriptor, or a string file path
  * `callback` is a function with two parameters - an error object (if an error occured) and the GridStore object.

## Reading from a GridFS file

Use the `read` function to read from a GridStore object.

```js
gs.read([size], callback)
```

Where:

  * `size` is the length of the data to be read
  * `callback` is a callback function with two parameters - an error object (if an error occured) and data (binary string)

## Streaming from GridFS

You can stream data as it comes from the database using `stream`.

```js
gs.stream()
```
    
The function returns a [read stream](http://nodejs.org/docs/v0.4.12/api/streams.html#readable_Stream) based on this GridStore file. It supports the events 'read', 'error', 'close' and 'end'.

## Delete a GridFS file

Use the `unlink` function to delete GridStore files.

```js
GridStore.unlink(db, name, callback)
```

Where:

  * `db` is the database object
  * `name` is either the name of a GridStore object or an array of GridStore object names
  * `callback` is the callback function

## Closing a GridFS file

GridStore needs to be closed after usage. Use the `close` function:

```js
gs.close(callback)
```
    
## Check if a GridFS file exists

Use the `exist` function to check if a file exists:

```js
GridStore.exist(db, filename, callback)
```
    
Where:

  * `db` is the database object
  * `filename` is the name of the file to be checked or a regular expression
  * `callback` is a callback function with two parameters - an error object (if an error occured) and a boolean value indicating if the file exists or not
  
## Seek to a specific position for reading

Seeking within a file can be done with `seek`:

```js
gs.seek(position);
```

This function moves the internal pointer to the specified position.
