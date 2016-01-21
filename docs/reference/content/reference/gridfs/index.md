+++
date = "2015-08-05T12:00:00-00:00"
title = "GridFS"
[menu.main]
  parent = "Reference"
  identifier = "GridFS"
  weight = 80
  pre = "<i class='fa'></i>"
+++

## GridFS

GridFS is a specification for storing and retrieving files that exceed the BSON-document size limit of 16MB.

Instead of storing a file in a single document, GridFS divides a file into parts, or chunks, and stores each of those chunks as a separate document. By default GridFS limits chunk size to 255k. GridFS uses two collections to store files. The chunks collection stores the file chunks, and the files collection stores the file metadata.

When you query a GridFS store for a file, the driver or client will reassemble the chunks as needed. GridFS is useful not only for storing files that exceed 16MB but also for storing any files for which you want access without having to load the entire file into memory.

{{% note %}}
For more information about GridFS see the [MongoDB GridFS documentation](http://docs.mongodb.org/manual/core/gridfs/).
{{% /note %}}

The Node.js Driver includes the legacy `GridStore` API.

- [GridStore]({{<relref "reference/gridfs/gridstore.md">}}): documentation on how to use the `GridStore` API.

