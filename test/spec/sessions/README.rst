====================
Driver Session Tests
====================

.. contents::

----

Introduction
============

The YAML and JSON files in this directory are platform-independent tests
meant to exercise a driver's implementation of sessions. These tests utilize the
`Unified Test Format <../../unified-test-format/unified-test-format.rst>`__.

Several prose tests, which are not easily expressed in YAML, are also presented
in the Driver Sessions Spec. Those tests will need to be manually implemented
by each driver.

Snapshot session tests
======================
Snapshot sessions tests require server of version 5.0 or higher and 
replica set or a sharded cluster deployment.
Default snapshot history window on the server is 5 minutes. Running the test in debug mode, or in any other slow configuration
may lead to `SnapshotTooOld` errors. Drivers can work around this issue by increasing the server's `minSnapshotHistoryWindowInSeconds` parameter, for example:

.. code:: python

    client.admin.command('setParameter', 1, minSnapshotHistoryWindowInSeconds=60)

Prose tests
```````````

1. Setting both ``snapshot`` and ``causalConsistency`` to true is not allowed
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

* ``client.startSession(snapshot = true, causalConsistency = true)``
* Assert that an error was raised by driver

Changelog
=========

:2019-05-15: Initial version.
:2021-06-15: Added snapshot-session tests. Introduced legacy and unified folders.
:2021-07-30: Use numbering for prose test
:2022-02-11: Convert legacy tests to unified format
