+++
date = "2015-10-15T14:27:51-04:00"
title = "GridFS Streaming"
[menu.main]
  parent = "GridFS"
  identifier = "GridFSStream"
  weight = 30
  pre = "<i class='fa'></i>"
+++

[GridFS](http://docs.mongodb.org/manual/core/gridfs/) is a mechanism for
storing large files in MongoDB. As you might know, MongoDB documents are
limited to
[16MB](http://docs.mongodb.org/manual/reference/limits/#limit-bson-document-size).
GridFS provides a mechanism to work around that limitation by enabling you
to break up files into chunks that are smaller than 16MB.

The MongoDB Node.js
driver now supports a
[stream-based API for GridFS](https://github.com/mongodb/specifications/blob/master/source/gridfs/gridfs-spec.rst)
that's compatible with Node.js'
[streams3](https://strongloop.com/strongblog/whats-new-io-js-beta-streams3/), so you can `.pipe()` directly from file streams to MongoDB. In
this tutorial, you'll see how to use the new GridFS streaming API to upload
[a CC-licensed 28 MB recording of the overture from Richard Wagner's opera *Die Meistersinger von Nurnberg*](https://musopen.org/music/213/richard-wagner/die-meistersinger-von-nurnberg-overture/)
to MongoDB using streams.

Getting Set Up
--------------

The new GridFS streaming API will be part of the 2.1.0 release of the
[MongoDB Node.js driver](https://www.npmjs.com/package/mongodb). If you want
a pre-release preview, just make put the following dependency in your
`package.json`. We strongly recommend not using versions from GitHub in
production, but it's fine for experimentation.

```
{
  "dependencies": {
    "mongodb": "https://github.com/mongodb/node-mongodb-native/archive/gridfs-specification.tar.gz"
  }
}
```

Uploading a File
----------------

Let's see how to upload a file to MongoDB using the new API. For this example,
I'm going to assume that you have a file named `meistersinger.mp3` in the
root directory of your project. You can use whichever file you want, or you
can just download a [*Die Meistersinger* Overture mp3](https://musopen.org/music/213/richard-wagner/die-meistersinger-von-nurnberg-overture/).

In order to use the new streaming GridFS API, you first need to create
a `GridFSBucket`. This class will enable you to access the streaming GridFS
API.

```javascript
mongodb.MongoClient.connect(uri, function(error, db) {
  assert.ifError(error);

  var bucket = new mongodb.GridFSBucket(db);

  // Use bucket...
});
```

Now that you have the bucket, how do you upload a file? The bucket has an
`openUploadStream()` method that creates an upload stream for a given
file name. You can then just pipe a Node.js `fs` read stream to the
upload stream.

```javascript
var assert = require('assert');
var fs = require('fs');
var mongodb = require('mongodb');

var uri = 'mongodb://localhost:27017/test';

mongodb.MongoClient.connect(uri, function(error, db) {
  assert.ifError(error);

  var bucket = new mongodb.GridFSBucket(db);

  fs.createReadStream('./meistersinger.mp3').
    pipe(bucket.openUploadStream('meistersinger.mp3')).
    on('error', function(error) {
      assert.ifError(error);
    }).
    on('finish', function() {
      console.log('done!');
      process.exit(0);
    });
});
```

Assuming that your `test` database was empty, you should see that the above
script created 2 collections in your `test` database: `fs.chunks` and
`fs.files`. The `fs.files` collection contains high-level metadata about
the files stored in this bucket. For instance, the file you just uploaded
has a document that looks like what you see below.

```
> db.fs.files.findOne()
{
	"_id" : ObjectId("561fc381e81346c82d6397bb"),
	"length" : 27847575,
	"chunkSize" : 261120,
	"uploadDate" : ISODate("2015-10-15T15:17:21.819Z"),
	"md5" : "2459f1cdec4d9af39117c3424326d5e5",
	"filename" : "meistersinger.mp3"
}
```

The above document says that the file is named 'meistersinger.mp3', and tells
you its size in bytes, when it was uploaded, and the
[md5](https://en.wikipedia.org/wiki/MD5) of the contents. There's also a
`chunkSize` field. This field says how big the 'chunks' that the file is
broken up into are. In this case, the `chunkSize` is 255KB, which is the
default. For instance, after you upload 'meistersinger.mp3', there should be
107 documents in the `fs.chunks` collection.

```
> db.fs.chunks.count()
107
```

Not surprisingly, 27847575/261120 is approximately 106.64, so the `fs.chunks`
collection contains 106 chunks with size 255KB and 1 chunk that's roughly
255KB * 0.64. Each individual chunks document is similar to the document below.

```
> db.fs.chunks.findOne({}, { data: 0 })
{
	"_id" : ObjectId("561fc381e81346c82d6397bc"),
	"files_id" : ObjectId("561fc381e81346c82d6397bb"),
	"n" : 0
}
```

The chunk document keeps track of which file it belongs to and its order in
the list of chunks. The chunk document also has a `data` field that contains
the raw bytes of the file.

You can configure both the chunk size and the `fs` prefix for the files and
chunks collections at the bucket level. For instance, if you specify the
`chunkSizeBytes` and `bucketName` options as shown below, you'll get
27195 chunks in the `songs.chunks` collection.

```
var bucket = new mongodb.GridFSBucket(db, {
  chunkSizeBytes: 1024,
  bucketName: 'songs'
});

fs.createReadStream('./meistersinger.mp3').
  pipe(bucket.openUploadStream('meistersinger.mp3')).
  on('error', function(error) {
    assert.ifError(error);
  }).
  on('finish', function() {
    console.log('done!');
    process.exit(0);
  });
```

Downloading a File
------------------

Congratulations, you've successfully uploaded a file to MongoDB! However,
a file sitting in MongoDB isn't particularly useful. In order to stream the
file to your hard drive, an HTTP response, or to npm modules like
[speaker](https://www.npmjs.com/package/speaker), you're going to need
a download stream. The easiest way to get a download stream is
the `openDownloadStreamByName()` method.

```javascript
var bucket = new mongodb.GridFSBucket(db, {
  chunkSizeBytes: 1024,
  bucketName: 'songs'
});

bucket.openDownloadStreamByName('meistersinger.mp3').
  pipe(fs.createWriteStream('./output.mp3')).
  on('error', function(error) {
    assert.ifError(error);
  }).
  on('finish', function() {
    console.log('done!');
    process.exit(0);
  });
```

Now, you have an `output.mp3` file that's a copy of the original
`meistersinger.mp3` file. The download stream also enables you to do some
neat tricks. For instance, you can cut off the beginning of the song by
specifying a number of bytes to skip. You can cut off the first 41 seconds of
the mp3 and skip right to the good part of the song as shown below.

```javascript
bucket.openDownloadStreamByName('meistersinger.mp3').
  start(1024 * 1585). // <-- skip the first 1585 KB, approximately 41 seconds
  pipe(fs.createWriteStream('./output.mp3')).
  on('error', function(error) {
    assert.ifError(error);
  }).
  on('finish', function() {
    console.log('done!');
    process.exit(0);
  });
```

An important point to be aware of regarding performance is that the GridFS
streaming API can't load partial chunks. When a download stream needs to pull a
chunk from MongoDB, it pulls the entire chunk into memory. The 255KB default
chunk size is usually sufficient, but you can reduce the chunk size to reduce
memory overhead.

Moving On
---------

Congratulations, you've just used MongoDB and Node.js streams to store and
manipulate an mp3. With GridFS, you have a file system with all the
horizontal scalability features of MongoDB. Now, it also has a neat stream-based
API so can `pipe()` files to and from MongoDB.
