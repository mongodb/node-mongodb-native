======================
Index Management Tests
======================

.. contents::

----

Test Plan
=========

These prose tests are ported from the legacy enumerate-indexes spec.

Configurations
--------------

- standalone node
- replica set primary node
- replica set secondary node
- mongos node

Preparation
-----------

For each of the configurations:

- Create a (new) database
- Create a collection
- Create a single column index, a compound index, and a unique index
- Insert at least one document containing all the fields that the above
  indicated indexes act on

Tests

- Run the driver's method that returns a list of index names, and:

  - verify that *all* index names are represented in the result
  - verify that there are no duplicate index names
  - verify there are no returned indexes that do not exist

- Run the driver's method that returns a list of index information records, and:

  - verify all the indexes are represented in the result
  - verify the "unique" flags show up for the unique index
  - verify there are no duplicates in the returned list
  - if the result consists of statically defined index models that include an ``ns`` field, verify
    that its value is accurate

Search Index Management Helpers
-------------------------------

These tests are intended to smoke test the search management helpers end-to-end against a live Atlas cluster.

The search index management commands are asynchronous and mongod/mongos returns before the changes to a clusters' search indexes have completed.  When
these prose tests specify "waiting for the changes", drivers should repeatedly poll the cluster with ``listSearchIndexes``
until the changes are visible.  Each test specifies the condition that is considered "ready".  For example, when creating a 
new search index, waiting until the inserted index has a status ``queryable: true`` indicates that the index was successfully
created.

The commands tested in these prose tests take a while to successfully complete.  Drivers should raise the timeout for each test to avoid timeout errors if 
the test timeout is too low.  5 minutes is a sufficiently large timeout that any timeout that occurs indicates a real failure, but this value is not required and can be tweaked per-driver.

There is a server-side limitation that prevents multiple search indexes from being created with the same name, definition and 
collection name.  This limitation does not take into account collection uuid.  Because these commands are asynchronous, any cleanup
code that may run after a test (cleaning a database or dropping search indexes) may not have completed by the next iteration of the 
test (or the next test run, if running locally).  To address this issue, each test uses a randomly generated collection name.  Drivers
may generate this collection name however they like, but a suggested implementation is a hex representation of an
ObjectId (``new ObjectId().toHexString()`` in Node).

Setup
~~~~~

These tests must run against an Atlas cluster with a 7.0+ server.  `Scripts are available <https://github.com/mongodb-labs/drivers-evergreen-tools/tree/master/.evergreen/atlas>`_ in drivers-evergreen-tools which can setup and teardown
Atlas clusters.  To ensure that the Atlas cluster is cleaned up after each CI run, drivers should configure evergreen to run these tests 
as a part of a task group.  Be sure that the cluster gets torn down! 

When working locally on these tests, the same Atlas setup and teardown scripts can be used locally to provision a cluster for development.

Case 1: Driver can successfully create and list search indexes
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

#. Create a collection with the "create" command using a randomly generated name (referred to as ``coll0``).
#. Create a new search index on ``coll0`` with the ``createSearchIndex`` helper.  Use the following definition:

   .. code:: typescript

     {
       name: 'test-search-index',
       definition: {
         mappings: { dynamic: false }
       }
     }

#. Assert that the command returns the name of the index: ``"test-search-index"``.
#. Run ``coll0.listSearchIndexes()`` repeatedly every 5 seconds until the following condition is satisfied and store the value in a variable ``index``:

   - An index with the ``name`` of ``test-search-index`` is present and the index has a field ``queryable`` with a value of ``true``.

#. Assert that ``index`` has a property ``latestDefinition`` whose value is ``{ 'mappings': { 'dynamic': false } }``

Case 2: Driver can successfully create multiple indexes in batch
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

#. Create a collection with the "create" command using a randomly generated name (referred to as ``coll0``).
#. Create two new search indexes on ``coll0`` with the ``createSearchIndexes`` helper.  Use the following
   definitions when creating the indexes.  These definitions are referred to as ``indexDefinitions``.

   .. code:: typescript

     {
       name: 'test-search-index-1',
       definition: {
         mappings: { dynamic: false }
       }
     }

     {
       name: 'test-search-index-2',
       definition: {
         mappings: { dynamic: false }
       }
     }

#. Assert that the command returns an array containing the new indexes' names: ``["test-search-index-1", "test-search-index-2"]``.
#. Run ``coll0.listSearchIndexes()`` repeatedly every 5 seconds until the following conditions are satisfied.

   - An index with the ``name`` of ``test-search-index-1`` is present and index has a field ``queryable`` with the value of ``true``. Store result in ``index1``.
   - An index with the ``name`` of ``test-search-index-2`` is present and index has a field ``queryable`` with the value of ``true``. Store result in ``index2``.

#. Assert that ``index1`` and ``index2`` have the property ``latestDefinition`` whose value is ``{ "mappings" : { "dynamic" : false } }``

Case 3: Driver can successfully drop search indexes
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

#. Create a collection with the "create" command using a randomly generated name (referred to as ``coll0``).
#. Create a new search index on ``coll0`` with the following definition:

   .. code:: typescript

     {
       name: 'test-search-index',
       definition: {
         mappings: { dynamic: false }
       }
     }

#. Assert that the command returns the name of the index: ``"test-search-index"``.
#. Run ``coll0.listSearchIndexes()`` repeatedly every 5 seconds until the following condition is satisfied:

   - An index with the ``name`` of ``test-search-index`` is present and index has a field ``queryable`` with the value of ``true``.

#. Run a ``dropSearchIndex`` on ``coll0``, using ``test-search-index`` for the name.
#. Run ``coll0.listSearchIndexes()`` repeatedly every 5 seconds until ``listSearchIndexes`` returns an empty array.

This test fails if it times out waiting for the deletion to succeed.

Case 4: Driver can update a search index
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

#. Create a collection with the "create" command using a randomly generated name (referred to as ``coll0``).
#. Create a new search index on ``coll0`` with the following definition:

   .. code:: typescript

     {
       name: 'test-search-index',
       definition: {
         mappings: { dynamic: false }
       }
     }

#. Assert that the command returns the name of the index: ``"test-search-index"``.
#. Run ``coll0.listSearchIndexes()`` repeatedly every 5 seconds until the following condition is satisfied:

   - An index with the ``name`` of ``test-search-index`` is present and index has a field ``queryable`` with the value of ``true``.

#. Run a ``updateSearchIndex`` on ``coll0``, using the following definition.

   .. code:: typescript

     {
       name: 'test-search-index',
       definition: {
         mappings: { dynamic: true }
       }
     }

#. Assert that the command does not error and the server responds with a success.
#. Run ``coll0.listSearchIndexes()`` repeatedly every 5 seconds until the following conditions are satisfied:

   - An index with the ``name`` of ``test-search-index`` is present.  This index is referred to as ``index``.
   - The index has a field ``queryable`` with a value of ``true`` and has a field ``status`` with the value of ``READY``.

#. Assert that an index is present with the name ``test-search-index`` and the definition has a property ``latestDefinition`` whose value is ``{ 'mappings': { 'dynamic': true } }``.

Case 5: ``dropSearchIndex`` suppresses namespace not found errors
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

#. Create a driver-side collection object for a randomly generated collection name.  Do not create this collection on the server.
#. Run a ``dropSearchIndex`` command and assert that no error is thrown.

Case 6: Driver can successfully create and list search indexes with non-default readConcern and writeConcern
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

#. Create a collection with the "create" command using a randomly generated name (referred to as ``coll0``).
#. Apply a write concern ``WriteConcern(w=1)`` and a read concern with ``ReadConcern(level="majority")`` to ``coll0``.
#. Create a new search index on ``coll0`` with the ``createSearchIndex`` helper.  Use the following definition:

   .. code:: typescript

     {
       name: 'test-search-index-case6',
       definition: {
         mappings: { dynamic: false }
       }
     }

#. Assert that the command returns the name of the index: ``"test-search-index-case6"``.
#. Run ``coll0.listSearchIndexes()`` repeatedly every 5 seconds until the following condition is satisfied and store the value in a variable ``index``:

   - An index with the ``name`` of ``test-search-index-case6`` is present and the index has a field ``queryable`` with a value of ``true``.

#. Assert that ``index`` has a property ``latestDefinition`` whose value is ``{ 'mappings': { 'dynamic': false } }``
