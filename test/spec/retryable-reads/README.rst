=====================
Retryable Reads Tests
=====================

.. contents::

----

Introduction
============

The YAML and JSON files in this directory tree are platform-independent tests
that drivers can use to prove their conformance to the Retryable Reads spec.

Prose tests, which are not easily expressed in YAML, are also presented
in this file. Those tests will need to be manually implemented by each driver.

Tests will require a MongoClient created with options defined in the tests.
Integration tests will require a running MongoDB cluster with server versions
4.0 or later.

N.B. The spec specifies 3.6 as the minimum server version: however,
``failCommand`` is not supported on 3.6, so for now, testing requires MongoDB
4.0. Once `DRIVERS-560`_ is resolved, we will attempt to adapt its live failure
integration tests to test Retryable Reads on MongoDB 3.6.

.. _DRIVERS-560: https://jira.mongodb.org/browse/DRIVERS-560

Server Fail Point
=================

See: `Server Fail Point`_ in the Transactions spec test suite.

.. _Server Fail Point: ../../transactions/tests#server-fail-point

Disabling Fail Point after Test Execution
-----------------------------------------

After each test that configures a fail point, drivers should disable the
``failCommand`` fail point to avoid spurious failures in
subsequent tests. The fail point may be disabled like so::

    db.runCommand({
        configureFailPoint: "failCommand",
        mode: "off"
    });

Network Error Tests
===================

Network error tests are expressed in YAML and should be run against a standalone,
shard cluster, or single-node replica set.


Test Format
-----------

Each YAML file has the following keys:

- ``runOn`` (optional): An array of server version and/or topology requirements
  for which the tests can be run. If the test environment satisfies one or more
  of these requirements, the tests may be executed; otherwise, this file should
  be skipped. If this field is omitted, the tests can be assumed to have no
  particular requirements and should be executed. Each element will have some or
  all of the following fields:

  - ``minServerVersion`` (optional): The minimum server version (inclusive)
    required to successfully run the tests. If this field is omitted, it should
    be assumed that there is no lower bound on the required server version.

  - ``maxServerVersion`` (optional): The maximum server version (inclusive)
    against which the tests can be run successfully. If this field is omitted,
    it should be assumed that there is no upper bound on the required server
    version.

  - ``topology`` (optional): An array of server topologies against which the
    tests can be run successfully. Valid topologies are "single", "replicaset",
    and "sharded". If this field is omitted, the default is all topologies (i.e.
    ``["single", "replicaset", "sharded"]``).

- ``database_name`` and ``collection_name``: Optional. The database and
  collection to use for testing.
  
- ``bucket_name``: Optional. The GridFS bucket name to use for testing.

- ``data``: The data that should exist in the collection(s) under test before
  each test run. This will typically be an array of documents to be inserted
  into the collection under test (i.e. ``collection_name``); however, this field
  may also be an object mapping collection names to arrays of documents to be
  inserted into the specified collection.
    
- ``tests``: An array of tests that are to be run independently of each other.
  Each test will have some or all of the following fields:

  - ``description``: The name of the test.
    
  - ``clientOptions``: Optional, parameters to pass to MongoClient().

  - ``useMultipleMongoses`` (optional): If ``true``, the MongoClient for this
    test should be initialized with multiple mongos seed addresses. If ``false``
    or omitted, only a single mongos address should be specified. This field has
    no effect for non-sharded topologies.
    
  - ``skipReason``: Optional, string describing why this test should be skipped.

  - ``failPoint``: Optional, a server fail point to enable, expressed as the
    configureFailPoint command to run on the admin database.

  - ``operations``: An array of documents describing an operation to be
    executed. Each document has the following fields:

    - ``name``: The name of the operation on ``object``.

    - ``object``: The name of the object to perform the operation on. Can be
      "database", "collection", "client", or "gridfsbucket."

    - ``arguments``: Optional, the names and values of arguments.

    - ``result``: Optional. The return value from the operation, if any. This
      field may be a scalar (e.g. in the case of a count), a single document, or
      an array of documents in the case of a multi-document read.
      
    - ``error``: Optional. If ``true``, the test should expect an error or
      exception.
        
  - ``expectations``: Optional list of command-started events.

GridFS Tests
------------

GridFS tests are denoted by when the YAML file contains ``bucket_name``.
The ``data`` field will also be an object, which maps collection names
(e.g. ``fs.files``) to an array of documents that should be inserted into
the specified collection.

``fs.files`` and ``fs.chunks`` should be created in the database
specified by ``database_name``. This could be done via inserts or by
creating GridFSBuckets—using the GridFS ``bucketName`` (see
`GridFSBucket spec`_) specified by ``bucket_name`` field in the YAML
file—and calling ``upload_from_stream_with_id`` with the appropriate
data.

``Download`` tests should be tested against ``GridFS.download_to_stream``.
``DownloadByName`` tests should be tested against
``GridFS.download_to_stream_by_name``.


.. _GridFSBucket spec: https://github.com/mongodb/specifications/blob/master/source/gridfs/gridfs-spec.rst#configurable-gridfsbucket-class
    
Speeding Up Tests
-----------------

Drivers may benefit reducing `minHeartbeatFrequencyMS`_ in order to speed up
tests. Python was able to decrease the run time of the tests greatly by lowering
the SDAM's ``minHeartbeatFrequencyMS`` from 500ms to 50ms, thus decreasing the
waiting time after a "not master" error:

.. _minHeartbeatFrequencyMS: https://github.com/mongodb/specifications/blob/master/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#minheartbeatfrequencyms
Optional Enumeration Commands
=============================

A driver only needs to test the optional enumeration commands it has chosen to
implement (e.g. ``Database.listCollectionNames()``).

Changelog
=========

:2019-03-19: Add top-level ``runOn`` field to denote server version and/or
             topology requirements requirements for the test file. Removes the
             ``minServerVersion`` and ``topology`` top-level fields, which are
             now expressed within ``runOn`` elements.

             Add test-level ``useMultipleMongoses`` field.
