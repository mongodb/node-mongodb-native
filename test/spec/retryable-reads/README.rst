=====================
Retryable Reads Tests
=====================

.. contents::

----

Introduction
============

The YAML and JSON files in the ``legacy`` and ``unified`` sub-directories are platform-independent tests
that drivers can use to prove their conformance to the Retryable Reads spec. Tests in the
``unified`` directory are written using the `Unified Test Format <../../unified-test-format/unified-test-format.rst>`_.
Tests in the ``legacy`` directory are written using the format described below.

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
    tests can be run successfully. Valid topologies are "single",
    "replicaset", "sharded", and "load-balanced". If this field is omitted,
    the default is all topologies (i.e. ``["single", "replicaset", "sharded",
    "load-balanced"]``).

  - ``serverless``: Optional string. Whether or not the test should be run on
    serverless instances imitating sharded clusters. Valid values are "require",
    "forbid", and "allow". If "require", the test MUST only be run on serverless
    instances. If "forbid", the test MUST NOT be run on serverless instances. If
    omitted or "allow", this option has no effect.

    The test runner MUST be informed whether or not serverless is being used in
    order to determine if this requirement is met (e.g. through an environment
    variable or configuration option). Since the serverless proxy imitates a
    mongos, the runner is not capable of determining this by issuing a server
    command such as ``buildInfo`` or ``hello``.

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

  - ``useMultipleMongoses`` (optional): If ``true``, and the topology type is
    ``Sharded``, the MongoClient for this test should be initialized with multiple
    mongos seed addresses. If ``false`` or omitted, only a single mongos address
    should be specified.

    If ``true``, and the topology type is ``LoadBalanced``, the MongoClient for
    this test should be initialized with the URI of the load balancer fronting
    multiple servers. If ``false`` or omitted, the MongoClient for this test
    should be initialized with the URI of the load balancer fronting a single
    server.

    ``useMultipleMongoses`` only affects ``Sharded`` and ``LoadBalanced`` topologies.

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

Drivers can greatly reduce the execution time of tests by setting `heartbeatFrequencyMS`_
and `minHeartbeatFrequencyMS`_ (internally) to a small value (e.g. 5ms), below what
is normally permitted in the SDAM spec. If a test specifies an explicit value for
heartbeatFrequencyMS (e.g. client or URI options), drivers MUST use that value.

.. _minHeartbeatFrequencyMS: ../../server-discovery-and-monitoring/server-discovery-and-monitoring.rst#minheartbeatfrequencyms
.. _heartbeatFrequencyMS: ../../server-discovery-and-monitoring/server-discovery-and-monitoring.rst#heartbeatfrequencyms

Optional Enumeration Commands
=============================

A driver only needs to test the optional enumeration commands it has chosen to
implement (e.g. ``Database.listCollectionNames()``).

PoolClearedError Retryability Test
==================================

This test will be used to ensure drivers properly retry after encountering PoolClearedErrors.
It MUST be implemented by any driver that implements the CMAP specification.
This test requires MongoDB 4.2.9+ for ``blockConnection`` support in the failpoint.

1. Create a client with maxPoolSize=1 and retryReads=true. If testing against a
   sharded deployment, be sure to connect to only a single mongos.

2. Enable the following failpoint::

     {
         configureFailPoint: "failCommand",
         mode: { times: 1 },
         data: {
             failCommands: ["find"],
             errorCode: 91,
             blockConnection: true,
             blockTimeMS: 1000
         }
     }

3. Start two threads and attempt to perform a ``findOne`` simultaneously on both.

4. Verify that both ``findOne`` attempts succeed.

5. Via CMAP monitoring, assert that the first check out succeeds.

6. Via CMAP monitoring, assert that a PoolClearedEvent is then emitted.

7. Via CMAP monitoring, assert that the second check out then fails due to a
   connection error.

8. Via Command Monitoring, assert that exactly three ``find`` CommandStartedEvents
   were observed in total.

9. Disable the failpoint.


Changelog
=========

:2022-01-10: Create legacy and unified subdirectories for new unified tests

:2021-08-27: Clarify behavior of ``useMultipleMongoses`` for ``LoadBalanced`` topologies.

:2019-03-19: Add top-level ``runOn`` field to denote server version and/or
             topology requirements requirements for the test file. Removes the
             ``minServerVersion`` and ``topology`` top-level fields, which are
             now expressed within ``runOn`` elements.

             Add test-level ``useMultipleMongoses`` field.

:2020-09-16: Suggest lowering heartbeatFrequencyMS in addition to minHeartbeatFrequencyMS.

:2021-03-23: Add prose test for retrying PoolClearedErrors

:2021-04-29: Add ``load-balanced`` to test topology requirements.
