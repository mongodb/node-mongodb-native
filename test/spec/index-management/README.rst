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
-----

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