===================
Versioned API Tests
===================

.. contents::

----

Notes
=====

This directory contains tests for the Versioned API specification. They are
implemented in the `Unified Test Format <../../unified-test-format/unified-test-format.rst>`__,
and require schema version 1.1. Note that to run these tests, the server must be
started with both ``enableTestCommands`` and ``acceptApiVersion2`` parameters
set to true.

Testing with required API version
=================================

Drivers MUST run their test suite against a cluster with the
``requireApiVersion`` parameter enabled and also requires authentication.

To run this test, proceed as follows:
- Start a standalone mongod instance

- Connect to the standalone instance and run the following command on the
  ``admin`` database: ``{ setParameter: 1, requireApiVersion: true }``

- Declare an API version for the test run through the ``MONGODB_API_VERSION``
  environment variable.

- If the environment variable is set, all clients created in tests MUST declare
  the ``ServerApiVersion`` specified.

No other topologies must be tested until ``mongo-orchestration`` can handle
servers with ``requireApiVersion`` enabled.
