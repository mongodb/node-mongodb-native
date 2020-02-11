=======================
Connection String Tests
=======================

The YAML and JSON files in this directory tree are platform-independent tests
that drivers can use to prove their conformance to the Read and Write Concern 
specification.

Version
-------

Files in the "specifications" repository have no version scheme. They are not
tied to a MongoDB server version.

Format
------

Connection String
~~~~~~~~~~~~~~~~~

These tests are designed to exercise the connection string parsing related
to read concern and write concern.

Each YAML file contains an object with a single ``tests`` key. This key is an
array of test case objects, each of which have the following keys:

- ``description``: A string describing the test.
- ``uri``: A string containing the URI to be parsed.
- ``valid:``: a boolean indicating if parsing the uri should result in an error.
- ``writeConcern:`` A document indicating the expected write concern.
- ``readConcern:`` A document indicating the expected read concern.

If a test case includes a null value for one of these keys, or if the key is missing,
no assertion is necessary. This both simplifies parsing of the test files and allows flexibility
for drivers that might substitute default values *during* parsing.

Document
~~~~~~~~

These tests are designed to ensure compliance with the spec in relation to what should be 
sent to the server.

Each YAML file contains an object with a single ``tests`` key. This key is an
array of test case objects, each of which have the following keys:

- ``description``: A string describing the test.
- ``valid:``: a boolean indicating if the write concern created from the document is valid.
- ``writeConcern:`` A document indicating the write concern to use.
- ``writeConcernDocument:`` A document indicating the write concern to be sent to the server.
- ``readConcern:`` A document indicating the read concern to use.
- ``readConcernDocument:`` A document indicating the read concern to be sent to the server.
- ``isServerDefault:`` Indicates whether the read or write concern is considered the server's default.
- ``isAcknowledged:`` Indicates if the write concern should be considered acknowledged.

Operation
~~~~~~~~~

These tests check that the default write concern is omitted in operations.

The spec test format is an extension of `transactions spec tests <https://github.com/mongodb/specifications/blob/master/source/transactions/tests/README.rst>`_ with the following additions:

- ``writeConcern`` in the ``databaseOptions`` or ``collectionOptions`` may be an empty document to indicate a `server default write concern <https://github.com/mongodb/specifications/blob/master/source/read-write-concern/read-write-concern.rst#servers-default-writeconcern>`_. For example, in libmongoc:

    .. code:: c

       /* Create a default write concern, and set on a collection object. */
       mongoc_write_concern_t *wc = mongoc_write_concern_new ();
       mongoc_collection_set_write_concern (collection, wc);

    If the driver has no way to explicitly set a default write concern on a database or collection, ignore the empty ``writeConcern`` document and continue with the test.
- The operations ``createIndex``, ``dropIndex`` are introduced.


Use as unit tests
=================

Testing whether a URI is valid or not should simply be a matter of checking
whether URI parsing raises an error or exception.
Testing for emitted warnings may require more legwork (e.g. configuring a log
handler and watching for output).
