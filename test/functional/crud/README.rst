==========
CRUD Tests
==========

The YAML and JSON files in this directory tree are platform-independent tests
meant to exercise the translation from the API to underlying commands that 
MongoDB understands. Given the variety of languages and implementations and 
limited nature of a description of a test, there are a number of things 
that aren't testable. For instance, none of these tests assert that maxTimeMS 
was properly sent to the server. This would involve a lot of infrastructure to 
define and setup. Therefore, these YAML tests are in no way a replacement for 
more thorough testing. However, they can provide an initial verification of 
your implementation.


Converting to JSON
==================

The tests are written in YAML
because it is easier for humans to write and read,
and because YAML includes a standard comment format.
A JSONified version of each YAML file is included in this repository.
Whenever you change the YAML, re-convert to JSON.
One method to convert to JSON is using 
`yamljs <https://www.npmjs.com/package/yamljs>`_::

    npm install -g yamljs
	yaml2json -s -p -r .
	

Version
=======

Files in the "specifications" repository have no version scheme.
They are not tied to a MongoDB server version,
and it is our intention that each specification moves from "draft" to "final"
with no further revisions; it is superseded by a future spec, not revised.

However, implementers must have stable sets of tests to target.
As test files evolve they will occasionally be tagged like
"crud-tests-YYYY-MM-DD", until the spec is final.

Format
======

Each YAML file has the following keys:

- data: The data that should exist in the collection under test before each test run.
- minServerVersion: OPTIONAL: The minimum server version required to successfully run the test. If this field is not
  present, it should be assumed that there is no lower bound on the server version required.
- maxServerVersion: OPTIONAL: The max server version against which this test can run successfully. If this field is not
  present, it should be assumed that there is no upper bound on the server version required.
- tests:
    An array of tests that are to be run independently of each other. Each test will 
    have some or all of the following fields

    - description: The name of the test
    - operation: 
      
      - name: The name of the operation as defined in the specification.
      - arguments: The names and values of arguments from the specification.
    - outcome:
      
      - result: The return value from the operation.
      - collection: 

          - name: OPTIONAL: The collection name to verify. If this isn't present
                  then use the collection under test.
          - data: The data that should exist in the collection after the 
                  operation has been run.


Use as integration tests
========================

Running these as integration tests will require a running mongod server.
Each of these tests is valid against a standalone mongod, a replica set, and a
sharded system for server version 3.0.0. Many of them will run against 2.4 and
2.6, but some will require conditional code. For instance, $out is not supported
in an aggregation pipeline in server 2.4, so that test must be skipped.
