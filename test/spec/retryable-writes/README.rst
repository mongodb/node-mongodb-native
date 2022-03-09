=====================
Retryable Write Tests
=====================

.. contents::

----

Introduction
============

Tests in this directory are platform-independent tests that drivers can use to
prove their conformance to the Retryable Writes specification.

Tests in the ``unified`` directory are implemented in the
`Unified Test Format <../../unified-test-format/unified-test-format.rst>`__.

Tests in the ``legacy`` directory should be executed as described below.

Several prose tests, which are not easily expressed in YAML, are also presented
in this file. Those tests will need to be manually implemented by each driver.

Tests will require a MongoClient created with options defined in the tests.
Integration tests will require a running MongoDB cluster with server versions
3.6.0 or later. The ``{setFeatureCompatibilityVersion: 3.6}`` admin command
will also need to have been executed to enable support for retryable writes on
the cluster. Some tests may have more stringent version requirements depending
on the fail points used.

Server Fail Point
=================

onPrimaryTransactionalWrite
---------------------------

Some tests depend on a server fail point, ``onPrimaryTransactionalWrite``, which
allows us to force a network error before the server would return a write result
to the client. The fail point also allows control whether the server will
successfully commit the write via its ``failBeforeCommitExceptionCode`` option.
Keep in mind that the fail point only triggers for transaction writes (i.e. write
commands including ``txnNumber`` and ``lsid`` fields). See `SERVER-29606`_ for
more information.

.. _SERVER-29606: https://jira.mongodb.org/browse/SERVER-29606

The fail point may be configured like so::

    db.runCommand({
        configureFailPoint: "onPrimaryTransactionalWrite",
        mode: <string|document>,
        data: <document>
    });

``mode`` is a generic fail point option and may be assigned a string or document
value. The string values ``"alwaysOn"`` and ``"off"`` may be used to enable or
disable the fail point, respectively. A document may be used to specify either
``times`` or ``skip``, which are mutually exclusive:

- ``{ times: <integer> }`` may be used to limit the number of times the fail
  point may trigger before transitioning to ``"off"``.
- ``{ skip: <integer> }`` may be used to defer the first trigger of a fail
  point, after which it will transition to ``"alwaysOn"``.

The ``data`` option is a document that may be used to specify options that
control the fail point's behavior. As noted in `SERVER-29606`_,
``onPrimaryTransactionalWrite`` supports the following ``data`` options, which
may be combined if desired:

- ``closeConnection``: Boolean option, which defaults to ``true``. If ``true``,
  the connection on which the write is executed will be closed before a result
  can be returned.
- ``failBeforeCommitExceptionCode``: Integer option, which is unset by default.
  If set, the specified exception code will be thrown and the write will not be
  committed. If unset, the write will be allowed to commit.

failCommand
-----------

Some tests depend on a server fail point, ``failCommand``, which allows the
client to force the server to return an error. Unlike
``onPrimaryTransactionalWrite``, ``failCommand`` does not allow the client to
directly control whether the server will commit the operation (execution of the
write depends on whether the ``closeConnection`` and/or ``errorCode`` options
are specified). See: `failCommand <../../transactions/tests#failcommand>`_ in
the Transactions spec test suite for more information.

Disabling Fail Points after Test Execution
------------------------------------------

After each test that configures a fail point, drivers should disable the fail
point to avoid spurious failures in subsequent tests. The fail point may be
disabled like so::

    db.runCommand({
        configureFailPoint: <fail point name>,
        mode: "off"
    });

Speeding Up Tests
=================

See `Speeding Up Tests <../../retryable-reads/tests/README.rst#speeding-up-tests>`_ in the retryable reads spec tests.

Use as Integration Tests
========================

Integration tests are expressed in YAML and can be run against a replica set or
sharded cluster as denoted by the top-level ``runOn`` field. Tests that rely on
the ``onPrimaryTransactionalWrite`` fail point cannot be run against a sharded
cluster because the fail point is not supported by mongos.

The tests exercise the following scenarios:

- Single-statement write operations

  - Each test expecting a write result will encounter at-most one network error
    for the write command. Retry attempts should return without error and allow
    operation to succeed. Observation of the collection state will assert that
    the write occurred at-most once.

  - Each test expecting an error will encounter successive network errors for
    the write command. Observation of the collection state will assert that the
    write was never committed on the server.

- Multi-statement write operations

  - Each test expecting a write result will encounter at-most one network error
    for some write command(s) in the batch. Retry attempts should return without
    error and allow the batch to ultimately succeed. Observation of the
    collection state will assert that each write occurred at-most once.

  - Each test expecting an error will encounter successive network errors for
    some write command in the batch. The batch will ultimately fail with an
    error, but observation of the collection state will assert that the failing
    write was never committed on the server. We may observe that earlier writes
    in the batch occurred at-most once.

We cannot test a scenario where the first and second attempts both encounter
network errors but the write does actually commit during one of those attempts.
This is because (1) the fail point only triggers when a write would be committed
and (2) the skip and times options are mutually exclusive. That said, such a
test would mainly assert the server's correctness for at-most once semantics and
is not essential to assert driver correctness.

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

- ``data``: The data that should exist in the collection under test before each
  test run.

- ``tests``: An array of tests that are to be run independently of each other.
  Each test will have some or all of the following fields:

  - ``description``: The name of the test.

  - ``clientOptions``: Parameters to pass to MongoClient().

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

  - ``failPoint`` (optional): The ``configureFailPoint`` command document to run
    to configure a fail point on the primary server. Drivers must ensure that
    ``configureFailPoint`` is the first field in the command. This option and
    ``useMultipleMongoses: true`` are mutually exclusive.

  - ``operation``: Document describing the operation to be executed. The
    operation should be executed through a collection object derived from a
    client that has been created with ``clientOptions``. The operation will have
    some or all of the following fields:

    - ``name``: The name of the operation as defined in the CRUD specification.

    - ``arguments``: The names and values of arguments from the CRUD
      specification.

  - ``outcome``: Document describing the return value and/or expected state of
    the collection after the operation is executed. This will have some or all
    of the following fields:

    - ``error``: If ``true``, the test should expect an error or exception. Note
      that some drivers may report server-side errors as a write error within a
      write result object.

    - ``result``: The return value from the operation. This will correspond to
      an operation's result object as defined in the CRUD specification. This
      field may be omitted if ``error`` is ``true``. If this field is present
      and ``error`` is ``true`` (generally for multi-statement tests), the
      result reports information about operations that succeeded before an
      unrecoverable failure. In that case, drivers may choose to check the
      result object if their BulkWriteException (or equivalent) provides access
      to a write result object.

      - ``errorLabelsContain``: A list of error label strings that the
        error is expected to have.

      - ``errorLabelsOmit``: A list of error label strings that the
        error is expected not to have.

    - ``collection``:

      - ``name`` (optional): The name of the collection to verify. If this isn't
        present then use the collection under test.

      - ``data``: The data that should exist in the collection after the
        operation has been run.

Split Batch Tests
=================

The YAML tests specify bulk write operations that are split by command type
(e.g. sequence of insert, update, and delete commands). Multi-statement write
operations may also be split due to ``maxWriteBatchSize``,
``maxBsonObjectSize``, or ``maxMessageSizeBytes``.

For instance, an insertMany operation with five 10 MiB documents executed using
OP_MSG payload type 0 (i.e. entire command in one document) would be split into
five insert commands in order to respect the 16 MiB ``maxBsonObjectSize`` limit.
The same insertMany operation executed using OP_MSG payload type 1 (i.e. command
arguments pulled out into a separate payload vector) would be split into two
insert commands in order to respect the 48 MB ``maxMessageSizeBytes`` limit.

Noting when a driver might split operations, the ``onPrimaryTransactionalWrite``
fail point's ``skip`` option may be used to control when the fail point first
triggers. Once triggered, the fail point will transition to the ``alwaysOn``
state until disabled. Driver authors should also note that the server attempts
to process all documents in a single insert command within a single commit (i.e.
one insert command with five documents may only trigger the fail point once).
This behavior is unique to insert commands (each statement in an update and
delete command is processed independently).

If testing an insert that is split into two commands, a ``skip`` of one will
allow the fail point to trigger on the second insert command (because all
documents in the first command will be processed in the same commit). When
testing an update or delete that is split into two commands, the ``skip`` should
be set to the number of statements in the first command to allow the fail point
to trigger on the second command.

Command Construction Tests
==========================

Drivers should also assert that command documents are properly constructed with
or without a transaction ID, depending on whether the write operation is
supported. `Command Monitoring`_ may be used to check for the presence of a
``txnNumber`` field in the command document. Note that command documents may
always include an ``lsid`` field per the `Driver Session`_ specification.

.. _Command Monitoring: ../../command-monitoring/command-monitoring.rst
.. _Driver Session: ../../sessions/driver-sessions.rst

These tests may be run against both a replica set and shard cluster.

Drivers should test that transaction IDs are never included in commands for
unsupported write operations:

* Write commands with unacknowledged write concerns (e.g. ``{w: 0}``)

* Unsupported single-statement write operations

  - ``updateMany()``
  - ``deleteMany()``

* Unsupported multi-statement write operations

  - ``bulkWrite()`` that includes ``UpdateMany`` or ``DeleteMany``

* Unsupported write commands

  - ``aggregate`` with write stage (e.g. ``$out``, ``$merge``)

Drivers should test that transactions IDs are always included in commands for
supported write operations:

* Supported single-statement write operations

  - ``insertOne()``
  - ``updateOne()``
  - ``replaceOne()``
  - ``deleteOne()``
  - ``findOneAndDelete()``
  - ``findOneAndReplace()``
  - ``findOneAndUpdate()``

* Supported multi-statement write operations

  - ``insertMany()`` with ``ordered=true``
  - ``insertMany()`` with ``ordered=false``
  - ``bulkWrite()`` with ``ordered=true`` (no ``UpdateMany`` or ``DeleteMany``)
  - ``bulkWrite()`` with ``ordered=false`` (no ``UpdateMany`` or ``DeleteMany``)

Prose Tests
===========

The following tests ensure that retryable writes work properly with replica sets
and sharded clusters.

#. Test that retryable writes raise an exception when using the MMAPv1 storage
   engine. For this test, execute a write operation, such as ``insertOne``,
   which should generate an exception. Assert that the error message is the
   replacement error message::

    This MongoDB deployment does not support retryable writes. Please add
    retryWrites=false to your connection string.

   and the error code is 20.
   
   **Note**: Drivers that rely on ``serverStatus`` to determine the storage engine
   in use MAY skip this test for sharded clusters, since ``mongos`` does not report
   this information in its ``serverStatus`` response.

#. Test that drivers properly retry after encountering PoolClearedErrors. This
   test MUST be implemented by any driver that implements the CMAP
   specification. This test requires MongoDB 4.2.9+ for ``blockConnection`` support in the failpoint.

   1. Create a client with maxPoolSize=1 and retryWrites=true. If testing
      against a sharded deployment, be sure to connect to only a single mongos.

   2. Enable the following failpoint::

       {
           configureFailPoint: "failCommand",
           mode: { times: 1 },
           data: {
               failCommands: ["insert"],
               errorCode: 91,
               blockConnection: true,
               blockTimeMS: 1000,
               errorLabels: ["RetryableWriteError"]
           }
       }

   3. Start two threads and attempt to perform an ``insertOne`` simultaneously on both.

   4. Verify that both ``insertOne`` attempts succeed.

   5. Via CMAP monitoring, assert that the first check out succeeds.

   6. Via CMAP monitoring, assert that a PoolClearedEvent is then emitted.

   7. Via CMAP monitoring, assert that the second check out then fails due to a
      connection error.

   8. Via Command Monitoring, assert that exactly three ``insert``
      CommandStartedEvents were observed in total.

   9. Disable the failpoint.


Changelog
=========



:2021-08-27: Add ``serverless`` to ``runOn``. Clarify behavior of
             ``useMultipleMongoses`` for ``LoadBalanced`` topologies.

:2021-04-23: Add ``load-balanced`` to test topology requirements.

:2021-03-24: Add prose test verifying ``PoolClearedErrors`` are retried.

:2019-10-21: Add ``errorLabelsContain`` and ``errorLabelsContain`` fields to
             ``result``

:2019-08-07: Add Prose Tests section

:2019-06-07: Mention $merge stage for aggregate alongside $out

:2019-03-01: Add top-level ``runOn`` field to denote server version and/or
             topology requirements requirements for the test file. Removes the
             ``minServerVersion`` and ``maxServerVersion`` top-level fields,
             which are now expressed within ``runOn`` elements.

             Add test-level ``useMultipleMongoses`` field.
