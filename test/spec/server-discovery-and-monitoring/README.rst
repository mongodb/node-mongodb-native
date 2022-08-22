=====================================
Server Discovery And Monitoring Tests
=====================================

.. contents::

----

The YAML and JSON files in this directory tree are platform-independent tests
that drivers can use to prove their conformance to the
Server Discovery And Monitoring Spec.

Additional prose tests, that cannot be represented as spec tests, are
described and MUST be implemented.

Version
-------

Files in the "specifications" repository have no version scheme. They are not
tied to a MongoDB server version.

Format
------

Each YAML file has the following keys:

- description: A textual description of the test.
- uri: A connection string.
- phases: An array of "phase" objects.
  A phase of the test optionally sends inputs to the client,
  then tests the client's resulting TopologyDescription.

Each phase object has the following keys:

- description: (optional) A textual description of this phase.
- responses: (optional) An array of "response" objects. If not provided,
  the test runner should construct the client and perform assertions specified
  in the outcome object without processing any responses.
- applicationErrors: (optional) An array of "applicationError" objects.
- outcome: An "outcome" object representing the TopologyDescription.

A response is a pair of values:

- The source, for example "a:27017".
  This is the address the client sent the "hello" or legacy hello command to.
- A hello or legacy hello response, for example ``{ok: 1, helloOk: true, isWritablePrimary: true}``.
  If the response includes an electionId it is shown in extended JSON like
  ``{"$oid": "000000000000000000000002"}``.
  The empty response `{}` indicates a network error
  when attempting to call "hello" or legacy hello.

An "applicationError" object has the following keys:

- address: The source address, for example "a:27017".
- generation: (optional) The error's generation number, for example ``1``.
  When absent this value defaults to the pool's current generation number.
- maxWireVersion: The ``maxWireVersion`` of the connection the error occurs
  on, for example ``9``. Added to support testing the behavior of "not writable primary"
  errors on <4.2 and >=4.2 servers.
- when: A string describing when this mock error should occur. Supported
  values are:

  - "beforeHandshakeCompletes": Simulate this mock error as if it occurred
    during a new connection's handshake for an application operation.
  - "afterHandshakeCompletes": Simulate this mock error as if it occurred
    on an established connection for an application operation (i.e. after
    the connection pool check out succeeds).

- type: The type of error to mock. Supported values are:

  - "command": A command error. Always accompanied with a "response".
  - "network": A non-timeout network error.
  - "timeout": A network timeout error.

- response: (optional) A command error response, for example
  ``{ok: 0, errmsg: "not primary"}``. Present if and only if ``type`` is
  "command". Note the server only returns "not primary" if the "hello" command
  has been run on this connection. Otherwise the legacy error message is returned.

In non-monitoring tests, an "outcome" represents the correct
TopologyDescription that results from processing the responses in the phases
so far. It has the following keys:

- topologyType: A string like "ReplicaSetNoPrimary".
- setName: A string with the expected replica set name, or null.
- servers: An object whose keys are addresses like "a:27017", and whose values
  are "server" objects.
- logicalSessionTimeoutMinutes: null or an integer.
- maxSetVersion: absent or an integer.
- maxElectionId: absent or a BSON ObjectId.
- compatible: absent or a bool.

A "server" object represents a correct ServerDescription within the client's
current TopologyDescription. It has the following keys:

- type: A ServerType name, like "RSSecondary". See `ServerType <../server-discovery-and-monitoring.rst#servertype>`_ for details pertaining to async and multi-threaded drivers.
- setName: A string with the expected replica set name, or null.
- setVersion: absent or an integer.
- electionId: absent, null, or an ObjectId.
- logicalSessionTimeoutMinutes: absent, null, or an integer.
- minWireVersion: absent or an integer.
- maxWireVersion: absent or an integer.
- topologyVersion: absent, null, or a topologyVersion document.
- pool: (optional) A "pool" object.

A "pool" object represents a correct connection pool for a given server.
It has the following keys:

- generation: This server's expected pool generation, like ``0``.

In monitoring tests, an "outcome" contains a list of SDAM events that should
have been published by the client as a result of processing hello or legacy hello
responses in the current phase. Any SDAM events published by the client during its
construction (that is, prior to processing any of the responses) should be
combined with the events published during processing of hello or legacy hello
responses of the first phase of the test. A test MAY explicitly verify events
published during client construction by providing an empty responses array for the
first phase.


Use as unittests
----------------

Mocking
~~~~~~~

Drivers should be able to test their server discovery and monitoring logic without
any network I/O, by parsing hello (or legacy hello) and application error from the
test file and passing them into the driver code. Parts of the client and
monitoring code may need to be mocked or subclassed to achieve this.
`A reference implementation for PyMongo 3.10.1 is available here
<https://github.com/mongodb/mongo-python-driver/blob/3.10.1/test/test_discovery_and_monitoring.py>`_.

Initialization
~~~~~~~~~~~~~~

For each file, create a fresh client object initialized with the file's "uri".

All files in the "single" directory include a connection string with one host
and no "replicaSet" option.
Set the client's initial TopologyType to Single, however that is achieved using the client's API.
(The spec says "The user MUST be able to set the initial TopologyType to Single"
without specifying how.)

All files in the "sharded" directory include a connection string with multiple hosts
and no "replicaSet" option.
Set the client's initial TopologyType to Unknown or Sharded, depending on the client's API.

All files in the "rs" directory include a connection string with a "replicaSet" option.
Set the client's initial TopologyType to ReplicaSetNoPrimary.
(For most clients, parsing a connection string with a "replicaSet" option
automatically sets the TopologyType to ReplicaSetNoPrimary.)

Set up a listener to collect SDAM events published by the client, including
events published during client construction.

Test Phases
~~~~~~~~~~~

For each phase in the file:

#. Parse the "responses" array. Pass in the responses in order to the driver
   code. If a response is the empty object ``{}``, simulate a network error.

#. Parse the "applicationErrors" array. For each element, simulate the given
   error as if it occurred while running an application operation. Note that
   it is sufficient to construct a mock error and call the procedure which
   updates the topology, e.g.
   ``topology.handleApplicationError(address, generation, maxWireVersion, error)``.

For non-monitoring tests,
once all responses are processed, assert that the phase's "outcome" object
is equivalent to the driver's current TopologyDescription.

For monitoring tests, once all responses are processed, assert that the
events collected so far by the SDAM event listener are equivalent to the
events specified in the phase.

Some fields such as "logicalSessionTimeoutMinutes", "compatible", and
"topologyVersion" were added later and haven't been added to all test files.
If these fields are present, test that they are equivalent to the fields of
the driver's current TopologyDescription or ServerDescription.

For monitoring tests, clear the list of events collected so far.

Continue until all phases have been executed.

Integration Tests
-----------------

Integration tests are provided in the "unified" directory and are
written in the `Unified Test Format
<../unified-test-format/unified-test-format.rst>`_.

Prose Tests
-----------

The following prose tests cannot be represented as spec tests and MUST be
implemented.

Streaming protocol Tests
~~~~~~~~~~~~~~~~~~~~~~~~

Drivers that implement the streaming protocol (multi-threaded or
asynchronous drivers) must implement the following tests. Each test should be
run against a standalone, replica set, and sharded cluster unless otherwise
noted.

Some of these cases should already be tested with the old protocol; in
that case just verify the test cases succeed with the new protocol.

1.  Configure the client with heartbeatFrequencyMS set to 500,
    overriding the default of 10000. Assert the client processes
    hello and legacy hello replies more frequently (approximately every 500ms).

RTT Tests
~~~~~~~~~

Run the following test(s) on MongoDB 4.4+.

1.  Test that RTT is continuously updated.

    #. Create a client with  ``heartbeatFrequencyMS=500``,
       ``appName=streamingRttTest``, and subscribe to server events.

    #. Run a find command to wait for the server to be discovered.

    #. Sleep for 2 seconds. This must be long enough for multiple heartbeats
       to succeed.

    #. Assert that each ``ServerDescriptionChangedEvent`` includes a non-zero
       RTT.

    #. Configure the following failpoint to block hello or legacy hello commands
       for 250ms which should add extra latency to each RTT check::

         db.adminCommand({
             configureFailPoint: "failCommand",
             mode: {times: 1000},
             data: {
               failCommands: ["hello"], // or the legacy hello command
               blockConnection: true,
               blockTimeMS: 500,
               appName: "streamingRttTest",
             },
         });

    #. Wait for the server's RTT to exceed 250ms. Eventually the average RTT
       should also exceed 500ms but we use 250ms to speed up the test. Note
       that the `Server Description Equality`_ rule means that
       ServerDescriptionChangedEvents will not be published. This test may
       need to use a driver specific helper to obtain the latest RTT instead.
       If the RTT does not exceed 250ms after 10 seconds, consider the test
       failed.

    #. Disable the failpoint::

         db.adminCommand({
             configureFailPoint: "failCommand",
             mode: "off",
         });

.. Section for links.

.. _Server Description Equality: /source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#server-description-equality
