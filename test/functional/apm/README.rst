.. role:: javascript(code)
  :language: javascript

==================
Command Monitoring
==================

.. contents::

--------

Testing
=======

Tests are provided in YML and JSON format to assert proper upconversion of commands.

Data
----

The {{data}} at the beginning of each test file is the data that should exist in the
collection under test before each test run.

Expectations
------------

Fake Placeholder Values
```````````````````````

When an attribute in an expectation contains the value {{"42"}}, {{42}} or {{""}}, this is a fake
placeholder value indicating that a special case MUST be tested that could not be
expressed in a YAML or JSON test. These cases are as follows:

Cursor Matching
^^^^^^^^^^^^^^^

When encountering a {{cursor}} or {{getMore}} value of {{"42"}} in a test, the driver MUST assert
that the values are equal to each other and greater than zero.

Errors
^^^^^^

For write errors, {{code}} values of {{42}} MUST assert that the value is present and
greater than zero. {{errmsg}} values of {{""}} MUST assert that the value is not empty
(a string of length greater than 1).

OK Values
^^^^^^^^^

The server is inconsistent on whether the ok values returned are integers or doubles so
for simplicity the tests specify all expected values as doubles. Server 'ok' values of
integers MUST be converted to doubles for comparison with the expected values.

Additional Values
`````````````````

The expected events provide the minimum data that is required and can be tested. It is
possible for more values to be present in the events, such as extra data provided when
using sharded clusters or ``nModified`` field in updates. The driver MUST assert the
expected data is present and also MUST allow for additional data to be present as well.

Ignoring Tests Based On Server Version
``````````````````````````````````````

Due to variations in server behaviour, some tests may not be valid on a specific range
of server versions and MUST NOT be run. These tests are indicated with the fields
{{ignore_if_server_version_greater_than}} and {{ignore_if_server_version_less_than}} which
are optionally provided at the description level of the test. When determining if the test
must be run or not, use only the minor server version.

Example:

If {{ignore_if_server_version_greater_than}} is {{3.0}}, then the tests MUST NOT run on
{{3.1}} and higher, but MUST run on {{3.0.3}}.

Tests which do not have either one of these fields MUST run on all supported server
versions.
