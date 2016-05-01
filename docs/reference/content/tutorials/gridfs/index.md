+++
date = "2015-08-05T12:00:00-00:00"
title = "GridFS"
[menu.main]
  parent = "Tutorials"
  identifier = "GridFS"
  weight = 80
  pre = "<i class='fa'></i>"
+++

# GridFS

[GridFS](http://docs.mongodb.org/manual/core/gridfs/) is a specification for storing and 
retrieving files that exceed the 
[BSON-document size limit](http://docs.mongodb.org/manual/reference/limits/#limit-bson-document-size)
of 16 megabytes.

Instead of storing a file in a single document, GridFS divides a file into parts, or chunks, and stores each of those chunks as a separate document. By default, GridFS limits chunk size to 255 kilobytes. GridFS uses two collections to store files: the `chunks` collection which stores the file chunks, and the `files`
collection that stores the file metadata.

When you query a GridFS store for a file, the driver or client will reassemble the chunks as needed. GridFS is useful not only for storing files that exceed 16 megabytes but also for storing any files which you want to access without having to load the entire file into memory.

{{% note %}}
For more information about GridFS, see the [MongoDB GridFS documentation](http://docs.mongodb.org/manual/core/gridfs/).
{{% /note %}}

The Node.js Driver includes the legacy `GridStore` API.

- [GridFS API]({{<relref "tutorials/gridfs/streaming.md">}}): documentation on how to use the `GridFS` API.
- [GridStore]({{<relref "tutorials/gridfs/gridstore.md">}}): the legacy `GridStore` API (driver version 1.4 and earlier).

