.. role:: javascript(code)
  :language: javascript

==============
Change Streams
==============

.. contents::

--------

Introduction
============

The YAML and JSON files in this directory are platform-independent tests that
drivers can use to prove their conformance to the Change Streams Spec.

Several prose tests, which are not easily expressed in YAML, are also presented
in this file. Those tests will need to be manually implemented by each driver.

Spec Test Format
================

Each YAML file has the following keys:

- ``database_name``: The default database
- ``collection_name``: The default collection
- ``database2_name``: Another database
- ``collection2_name``: Another collection
- ``tests``: An array of tests that are to be run independently of each other.
  Each test will have some of the following fields:

  - ``description``: The name of the test.
  - ``minServerVersion``: The minimum server version to run this test against. If not present, assume there is no minimum server version.
  - ``maxServerVersion``: Reserved for later use
  - ``failPoint``: Reserved for later use
  - ``target``: The entity on which to run the change stream. Valid values are:
  
    - ``collection``: Watch changes on collection ``database_name.collection_name``
    - ``database``: Watch changes on database ``database_name``
    - ``client``: Watch changes on entire clusters
  - ``topology``: An array of server topologies against which to run the test.
    Valid topologies are ``single``, ``replicaset``, and ``sharded``.
  - ``changeStreamPipeline``: An array of additional aggregation pipeline stages to add to the change stream
  - ``changeStreamOptions``: Additional options to add to the changeStream
  - ``operations``: Array of documents, each describing an operation. Each document has the following fields:
    - ``database``: Database against which to run the operation
    - ``collection``: Collection against which to run the operation
    - ``commandName``: Name of the command to run
    - ``arguments``: Object of arguments for the command (ex: document to insert)

  - ``expectations``: Optional list of command-started events in Extended JSON format
  - ``result``: Document with ONE of the following fields:

    - ``error``: Describes an error received during the test
    - ``success``: An Extended JSON array of documents expected to be received from the changeStream

Spec Test Match Function
========================

The definition of MATCH or MATCHES in the Spec Test Runner is as follows:

- MATCH takes two values, ``expected`` and ``actual``
- Notation is "Assert [actual] MATCHES [expected]
- Assertion passes if ``expected`` is a subset of ``actual``, with the values ``42`` and ``"42"`` acting as placeholders for "any value"

Pseudocode implementation of ``actual`` MATCHES ``expected``:

::
  
  If expected is "42" or 42:
    Assert that actual exists (is not null or undefined)
  Else:
    Assert that actual is of the same JSON type as expected
    If expected is a JSON array:
      For every idx/value in expected:
        Assert that actual[idx] MATCHES value
    Else if expected is a JSON object:
      For every key/value in expected
        Assert that actual[key] MATCHES value
    Else:
      Assert that expected equals actual

The expected values for ``result.success`` and ``expectations`` are written in Extended JSON. Drivers may adopt any of the following approaches to comparisons, as long as they are consistent:

- Convert ``actual`` to Extended JSON and compare to ``expected``
- Convert ``expected`` and ``actual`` to BSON, and compare them
- Convert ``expected`` and ``actual`` to native equivalents of JSON, and compare them

Spec Test Runner
================

Before running the tests

- Create a MongoClient ``globalClient``, and connect to the server

For each YAML file, for each element in ``tests``:

- If ``topology`` does not include the topology of the server instance(s), skip this test.
- Use ``globalClient`` to

  - Drop the database ``database_name``
  - Drop the database ``database2_name``
  - Create the database ``database_name`` and the collection ``database_name.collection_name``
  - Create the database ``database2_name`` and the collection ``database2_name.collection2_name``

- Create a new MongoClient ``client``
- Begin monitoring all APM events for ``client``. (If the driver uses global listeners, filter out all events that do not originate with ``client``). Filter out any "internal" commands (e.g. ``isMaster``)
- Using ``client``, create a changeStream ``changeStream`` against the specified ``target``. Use ``changeStreamPipeline`` and ``changeStreamOptions`` if they are non-empty
- Using ``globalClient``, run every operation in ``operations`` in serial against the server
- Wait until either:

  - An error occurs
  - All operations have been successful AND the changeStream has received as many changes as there are in ``result.success``

- Close ``changeStream``
- If there was an error:

  - Assert that an error was expected for the test.
  - Assert that the error MATCHES ``results.error``

- Else:

  - Assert that no error was expected for the test
  - Assert that the changes received from ``changeStream`` MATCH the results in ``results.success``

- If there are any ``expectations``

  - For each (``expected``, ``idx``) in ``expectations``

    - Assert that ``actual[idx]`` MATCHES ``expected``

- Close the MongoClient ``client``

After running all tests

- Close the MongoClient ``globalClient``
- Drop database ``database_name``
- Drop database ``database2_name``


Prose Tests
===========

The following tests have not yet been automated, but MUST still be tested

1. ``ChangeStream`` must continuously track the last seen ``resumeToken``
2. ``ChangeStream`` will throw an exception if the server response is missing the resume token
3. ``ChangeStream`` will automatically resume one time on a resumable error (including `not master`) with the initial pipeline and options, except for the addition/update of a ``resumeToken``.
4. ``ChangeStream`` will not attempt to resume on a server error
5. ``ChangeStream`` will perform server selection before attempting to resume, using initial ``readPreference``
6. Ensure that a cursor returned from an aggregate command with a cursor id and an initial empty batch is not closed on the driver side.
7. The ``killCursors`` command sent during the "Resume Process" must not be allowed to throw an exception.
8. ``$changeStream`` stage for ``ChangeStream`` against a server ``>=4.0`` that has not received any results yet MUST include a ``startAtOperationTime`` option when resuming a changestream.
9. ``ChangeStream`` will resume after a ``killCursors`` command is issued for its child cursor.
