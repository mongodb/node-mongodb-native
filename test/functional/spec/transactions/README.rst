==================
Transactions Tests
==================

.. contents::

----

Introduction
============

The YAML and JSON files in this directory are platform-independent tests that
drivers can use to prove their conformance to the Transactions Spec. They are
designed with the intention of sharing some test-runner code with the CRUD Spec
tests and the Command Monitoring Spec tests.

Several prose tests, which are not easily expressed in YAML, are also presented
in this file. Those tests will need to be manually implemented by each driver.

Test Format
===========

Each YAML file has the following keys:

- ``database_name`` and ``collection_name``: The database and collection to use
  for testing.

- ``data``: The data that should exist in the collection under test before each
  test run.

- ``tests``: An array of tests that are to be run independently of each other.
  Each test will have some or all of the following fields:

  - ``description``: The name of the test.

  - ``clientOptions``: Optional, parameters to pass to MongoClient().

  - ``sessionOptions``: Optional, parameters to pass to
    MongoClient.startSession().

  - ``operations``: Array of documents, each describing an operation to be
    executed. Each document has the following fields:

      - ``name``: The name of the operation on ``object``.

      - ``object``: The name of the object to perform the operation on. Can be
        "database", collection", "session0", or "session1".

      - ``collectionOptions``: Optional, parameters to pass to the Collection()
        used for this operation.

      - ``command_name``: Present only when ``name`` is "runCommand". The name
        of the command to run. Required for languages that are unable preserve
        the order keys in the "command" argument when parsing JSON/YAML.

      - ``arguments``: Optional, the names and values of arguments.

      - ``result``: The return value from the operation, if any. If the
        operation is expected to return an error, the ``result`` has one field,
        ``errorContains``, which is a substring of the expected error message
        or ``errorCodeName``, which is the expected server error "codeName".

  - ``expectations``: Optional list of command-started events.

  - ``outcome``: Document describing the return value and/or expected state of
    the collection after the operation is executed. Contains the following
    fields:

      - ``collection``:

        - ``data``: The data that should exist in the collection after the
          operations have run.

Use as integration tests
========================

Run a MongoDB replica set with a primary, a secondary, and an arbiter,
server version 4.0 or later. (Including a secondary ensures that server
selection in a transaction works properly. Including an arbiter helps ensure
that no new bugs have been introduced related to arbiters.)

Load each YAML (or JSON) file using a Canonical Extended JSON parser.

Then for each element in ``tests``:

#. Create a MongoClient and call
   ``client.admin.runCommand({killAllSessions: []})`` to clean up any open
   transactions from previous test failures. The command will fail with message
   "operation was interrupted", because it kills its own implicit session. Catch
   the exception and continue.
#. Create a collection object from the MongoClient, using the ``database_name``
   and ``collection_name`` fields of the YAML file.
#. Drop the test collection, using writeConcern "majority".
#. Execute the "create" command to recreate the collection, using writeConcern
   "majority". (Creating the collection inside a transaction is prohibited, so
   create it explicitly.)
#. If the YAML file contains a ``data`` array, insert the documents in ``data``
   into the test collection, using writeConcern "majority".
#. Create a **new** MongoClient ``client``, with Command Monitoring listeners
   enabled. (Using a new MongoClient for each test ensures a fresh session pool
   that hasn't executed any transactions previously, so the tests can assert
   actual txnNumbers, starting from 1.) Pass this test's ``clientOptions`` if
   present.
#. Call ``client.startSession`` twice to create ClientSession objects
   ``session0`` and ``session1``, using the test's "sessionOptions" if they
   are present. Save their lsids so they are available after calling
   ``endSession``, see `Logical Session Id`.
#. For each element in ``operations``:

   - Enter a "try" block or your programming language's closest equivalent.
   - Create a Database object from the MongoClient, using the ``database_name``
     field at the top level of the test file.
   - Create a Collection object from the Database, using the
     ``collection_name`` field at the top level of the test file.
     If ``collectionOptions`` is present create the Collection object with the
     provided options. Otherwise create the object with the default options.
   - Execute the named method on the provided ``object``, passing the
     arguments listed. Pass ``session0`` or ``session1`` to the method,
     depending on which session's name is in the arguments list.
     If ``arguments`` contains no "session", pass no explicit session to the
     method.
   - If the driver throws an exception / returns an error while executing this
     series of operations, store the error message and server error code.
   - If the result document has an "errorContains" field, verify that the
     method threw an exception or returned an error, and that the value of the
     "errorContains" field matches the error string. "errorContains" is a
     substring (case-insensitive) of the actual error message.
     If the result document has an "errorCodeName" field, verify that the
     method threw a command failed exception or returned an error, and that
     the value of the "errorCodeName" field matches the "codeName" in the
     server error response.
     If the operation returns a raw command response, eg from ``runCommand``,
     then compare only the fields present in the expected result document.
     Otherwise, compare the method's return value to ``result`` using the same
     logic as the CRUD Spec Tests runner.

#. Call ``session0.endSession()`` and ``session1.endSession``.
#. If the test includes a list of command-started events in ``expectations``,
   compare them to the actual command-started events using the
   same logic as the Command Monitoring Spec Tests runner, plus the rules in
   the Command-Started Events instructions below.
#. For each element in ``outcome``:

   - If ``name`` is "collection", verify that the test collection contains
     exactly the documents in the ``data`` array. Ensure this find uses
     Primary read preference even when the MongoClient is configured with
     another read preference.

TODO:

- drivers MUST NOT retry writes in a transaction even when retryWrites=true, needs to use failpoint.
- drivers MUST retry commit/abort, needs to use failpoint.
- test writeConcernErrors

Command-Started Events
``````````````````````

The event listener used for these tests MUST ignore the security commands
listed in the Command Monitoring Spec.

Logical Session Id
~~~~~~~~~~~~~~~~~~

Each command-started event in ``expectations`` includes an ``lsid`` with the
value "session0" or "session1". Tests MUST assert that the command's actual
``lsid`` matches the id of the correct ClientSession named ``session0`` or
``session1``.

Null Values
~~~~~~~~~~~

Some command-started events in ``expectations`` include ``null`` values for
fields such as ``txnNumber``, ``autocommit``, and ``writeConcern``.
Tests MUST assert that the actual command **omits** any field that has a
``null`` value in the expected command.

Cursor Id
^^^^^^^^^

A ``getMore`` value of ``"42"`` in a command-started event is a fake cursorId
that MUST be ignored. (In the Command Monitoring Spec tests, fake cursorIds are
correlated with real ones, but that is not necessary for Transactions Spec
tests.)

afterClusterTime
^^^^^^^^^^^^^^^^

A ``readConcern.afterClusterTime`` value of ``42`` in a command-started event
is a fake cluster time. Drivers MUST assert that the actual command includes an
afterClusterTime.
