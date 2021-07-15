===========================
Load Balancer Support Tests
===========================

.. contents::

----

Introduction
============

This document describes how drivers should create load balanced clusters for
testing and how tests should be executed for such clusters.

Testing Requirements
====================

For each server version that supports load balanced clusters, drivers MUST
add two Evergreen tasks: one with a sharded cluster with both authentication
and TLS enabled and one with a sharded cluster with authentication and TLS
disabled. In each task, the sharded cluster MUST be configured with two
mongos nodes running on localhost ports 27017 and 27018. The shard and config
servers may run on any free ports. Each task MUST also start up two TCP load
balancers operating in round-robin mode: one fronting both mongos servers and
one fronting a single mongos.

Load Balancer Configuration
---------------------------

Drivers MUST use the ``run-load-balancer.sh`` script in
``drivers-evergreen-tools`` to start the TCP load balancers for Evergreen
tasks. This script MUST be run after the backing sharded cluster has already
been started. The script writes the URIs of the load balancers to a YAML
expansions file, which can be read by drivers via the ``expansions.update``
Evergreen command. This will store the URIs into the ``SINGLE_MONGOS_LB_URI``
and ``MULTI_MONGOS_LB_URI`` environment variables.

Test Runner Configuration
-------------------------

If the backing sharded cluster is configured with TLS enabled, drivers MUST
add the relevant TLS options to both ``SINGLE_MONGOS_LB_URI`` and
``MULTI_MONGOS_LB_URI`` to ensure that test clients can connect to the
cluster. Drivers MUST use the final URI stored in ``SINGLE_MONGOS_LB_URI``
(with additional TLS options if required) to configure internal clients for
test runners (e.g. the internal MongoClient described by the `Unified Test
Format spec <../../unified-test-format/unified-test-format.rst>`__).

In addition to modifying load balancer URIs, drivers MUST also mock server
support for returning a ``serviceId`` field in ``hello`` or legacy ``hello``
command responses when running tests against a load-balanced cluster. This
can be done by using the value of ``topologyVersion.processId`` to set
``serviceId``. This MUST be done for all connections established by the test
runner, including those made by any internal clients.

Tests
======

The YAML and JSON files in this directory contain platform-independent tests
written in the `Unified Test Format
<../../unified-test-format/unified-test-format.rst>`_. Drivers MUST run the
following test suites against a load balanced cluster:

#. All test suites written in the Unified Test Format
#. Retryable Reads
#. Retryable Writes
#. Change Streams
#. Initial DNS Seedlist Discovery
