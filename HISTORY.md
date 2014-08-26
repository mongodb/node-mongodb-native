CHANGES
=======
- Insert method allows only up 1000 pr batch for legacy as well as 2.6 mode
- Streaming behavior is 0.10.x or higher with backwards compatibility using readable-stream npm package
- gridfs stream only available through .stream() method due to overlapping names on Gridstore object and streams in 0.10.x and higher of node
- remove third result on update and remove and return the whole result document instead (getting rid of the weird 3 result parameters)
    - Might break some application
- Returns the actual mongodb-core result
- MongoClient only has the connect method (no ability instantiate with Server, ReplSet or similar)
- Removed Grid class
- GridStore only supports w+ for metadata updates, no appending to file as it's not thread safe and can cause corruption of the data
    + seek will fail if attempt to use with w or w+
    + write will fail if attempted with w+ or r
    + w+ only works for updating metadata on a file

TODO
====
- Extend cursor to allow for setting all the options via methods instead of dealing with the current messed up find