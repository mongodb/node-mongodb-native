======================================
Client Side Operations Timeouts Tests
======================================

.. contents::

----

Introduction
============

This document describes the tests that drivers MUST run to validate the behavior of the timeoutMS option. These tests
are broken up into automated YAML/JSON tests and additional prose tests.

Spec Tests
==========

This directory contains a set of YAML and JSON spec tests. Drivers MUST run these as described in the "Unified Test
Runner" specification. Because the tests introduced in this specification are timing-based, there is a risk that some
of them may intermittently fail without any bugs being present in the driver. As a mitigation, drivers MAY execute
these tests in two new Evergreen tasks that use single-node replica sets: one with only authentication enabled and
another with both authentication and TLS enabled. Drivers that choose to do so SHOULD use the ``single-node-auth.json``
and ``single-node-auth-ssl.json`` files in the ``drivers-evergreen-tools`` repository to create these clusters.

Prose Tests
===========

There are some tests that cannot be expressed in the unified YAML/JSON format. For each of these tests, drivers MUST
create a MongoClient without the ``timeoutMS`` option set (referred to as ``internalClient``). Any fail points set
during a test MUST be unset using ``internalClient`` after the test has been executed. All MongoClient instances
created for tests MUST be configured with read/write concern ``majority``, read preference ``primary``, and command
monitoring enabled to listen for ``command_started`` events.

1. Multi-batch writes
~~~~~~~~~~~~~~~~~~~~~

This test MUST only run against standalones on server versions 4.4 and higher.
The ``insertMany`` call takes an exceedingly long time on replicasets and sharded
clusters. Drivers MAY adjust the timeouts used in this test to allow for differing
bulk encoding performance.

#. Using ``internalClient``, drop the ``db.coll`` collection.
#. Using ``internalClient``, set the following fail point:

   .. code:: javascript

       {
           configureFailPoint: "failCommand",
           mode: {
               times: 2
           },
           data: {
               failCommands: ["insert"],
               blockConnection: true,
               blockTimeMS: 1010
           }
       }

#. Create a new MongoClient (referred to as ``client``) with ``timeoutMS=2000``.
#. Using ``client``, insert 50 1-megabyte documents in a single ``insertMany`` call.

   - Expect this to fail with a timeout error.

#. Verify that two ``insert`` commands were executed against ``db.coll`` as part of the ``insertMany`` call.

2. maxTimeMS is not set for commands sent to mongocryptd
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

This test MUST only be run against enterprise server versions 4.2 and higher.

#. Launch a mongocryptd process on 23000.
#. Create a MongoClient (referred to as ``client``) using the URI ``mongodb://localhost:23000/?timeoutMS=1000``.
#. Using ``client``, execute the ``{ ping: 1 }`` command against the ``admin`` database.
#. Verify via command monitoring that the ``ping`` command sent did not contain a ``maxTimeMS`` field.

3. ClientEncryption
~~~~~~~~~~~~~~~~~~~

Each test under this category MUST only be run against server versions 4.4 and higher. In these tests,
``LOCAL_MASTERKEY`` refers to the following base64:

.. code:: javascript

  Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk

For each test, perform the following setup:

#. Using ``internalClient``, drop and create the ``keyvault.datakeys`` collection.
#. Create a MongoClient (referred to as ``keyVaultClient``) with ``timeoutMS=10``.
#. Create a ``ClientEncryption`` object that wraps ``keyVaultClient`` (referred to as ``clientEncryption``). Configure this object with ``keyVaultNamespace`` set to ``keyvault.datakeys`` and the following KMS providers map:

   .. code:: javascript

       {
           "local": { "key": <base64 decoding of LOCAL_MASTERKEY> }
       }

createDataKey
`````````````

#. Using ``internalClient``, set the following fail point:

   .. code:: javascript

       {
           configureFailPoint: "failCommand",
           mode: {
               times: 1
           },
           data: {
               failCommands: ["insert"],
               blockConnection: true,
               blockTimeMS: 15
           }
       }

#. Call ``clientEncryption.createDataKey()`` with the ``local`` KMS provider.

   - Expect this to fail with a timeout error.

#. Verify that an ``insert`` command was executed against to ``keyvault.datakeys`` as part of the ``createDataKey`` call.

encrypt
```````

#. Call ``client_encryption.createDataKey()`` with the ``local`` KMS provider.

   - Expect a BSON binary with subtype 4 to be returned, referred to as ``datakeyId``.

#. Using ``internalClient``, set the following fail point:

   .. code:: javascript

       {
           configureFailPoint: "failCommand",
           mode: {
               times: 1
           },
           data: {
               failCommands: ["find"],
               blockConnection: true,
               blockTimeMS: 15
           }
       }

#. Call ``clientEncryption.encrypt()`` with the value ``hello``, the algorithm ``AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic``, and the keyId ``datakeyId``.

   - Expect this to fail with a timeout error.

#. Verify that a ``find`` command was executed against the ``keyvault.datakeys`` collection as part of the ``encrypt`` call.

decrypt
```````

#. Call ``clientEncryption.createDataKey()`` with the ``local`` KMS provider.

   - Expect this to return a BSON binary with subtype 4, referred to as ``dataKeyId``.

#. Call ``clientEncryption.encrypt()`` with the value ``hello``, the algorithm ``AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic``, and the keyId ``dataKeyId``.

   - Expect this to return a BSON binary with subtype 6, referred to as ``encrypted``.

#. Close and re-create the ``keyVaultClient`` and ``clientEncryption`` objects.

#. Using ``internalClient``, set the following fail point:

   .. code:: javascript

       {
           configureFailPoint: "failCommand",
           mode: {
               times: 1
           },
           data: {
               failCommands: ["find"],
               blockConnection: true,
               blockTimeMS: 15
           }
       }

#. Call ``clientEncryption.decrypt()`` with the value ``encrypted``.

   - Expect this to fail with a timeout error.

#. Verify that a ``find`` command was executed against the ``keyvault.datakeys`` collection as part of the ``decrypt`` call.

4. Background Connection Pooling
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The tests in this section MUST only be run if the server version is 4.4 or higher and the URI has authentication
fields (i.e. a username and password). Each test in this section requires drivers to create a MongoClient and then wait
for some CMAP events to be published. Drivers MUST wait for up to 10 seconds and fail the test if the specified events
are not published within that time.

timeoutMS used for handshake commands
`````````````````````````````````````

#. Using ``internalClient``, set the following fail point:

   .. code:: javascript

       {
           configureFailPoint: "failCommand",
           mode: {
               times: 1
           },
           data: {
               failCommands: ["saslContinue"],
               blockConnection: true,
               blockTimeMS: 15,
               appName: "timeoutBackgroundPoolTest"
           }
       }

#. Create a MongoClient (referred to as ``client``) configured with the following:

   - ``minPoolSize`` of 1
   - ``timeoutMS`` of 10
   - ``appName`` of ``timeoutBackgroundPoolTest``
   - CMAP monitor configured to listen for ``ConnectionCreatedEvent`` and ``ConnectionClosedEvent`` events.

#. Wait for a ``ConnectionCreatedEvent`` and a ``ConnectionClosedEvent`` to be published.

timeoutMS is refreshed for each handshake command
`````````````````````````````````````````````````

#. Using ``internalClient``, set the following fail point:

   .. code:: javascript

       {
           configureFailPoint: "failCommand",
           mode: "alwaysOn",
           data: {
               failCommands: ["hello", "isMaster", "saslContinue"],
               blockConnection: true,
               blockTimeMS: 15,
               appName: "refreshTimeoutBackgroundPoolTest"
           }
       }

#. Create a MongoClient (referred to as ``client``) configured with the following:

   - ``minPoolSize`` of 1
   - ``timeoutMS`` of 20
   - ``appName`` of ``refreshTimeoutBackgroundPoolTest``
   - CMAP monitor configured to listen for ``ConnectionCreatedEvent`` and ``ConnectionReady`` events.

#. Wait for a ``ConnectionCreatedEvent`` and a ``ConnectionReady`` to be published.

5. Blocking Iteration Methods
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Tests in this section MUST only be run against server versions 4.4 and higher and only apply to drivers that have a
blocking method for cursor iteration that executes ``getMore`` commands in a loop until a document is available or an
error occurs.

Tailable cursors
````````````````

#. Using ``internalClient``, drop the ``db.coll`` collection.
#. Using ``internalClient``, insert the document ``{ x: 1 }`` into ``db.coll``.
#. Using ``internalClient``, set the following fail point:

   .. code:: javascript

       {
           configureFailPoint: "failCommand",
           mode: "alwaysOn",
           data: {
               failCommands: ["getMore"],
               blockConnection: true,
               blockTimeMS: 15
           }
       }

#. Create a new MongoClient (referred to as ``client``) with ``timeoutMS=20``.
#. Using ``client``, create a tailable cursor on ``db.coll`` with ``cursorType=tailable``.

   - Expect this to succeed and return a cursor with a non-zero ID.

#. Call either a blocking or non-blocking iteration method on the cursor.

   - Expect this to succeed and return the document ``{ x: 1 }`` without sending a ``getMore`` command.

#. Call the blocking iteration method on the resulting cursor.

   - Expect this to fail with a timeout error.

#. Verify that a ``find`` command and two ``getMore`` commands were executed against the ``db.coll`` collection during the test.

Change Streams
``````````````

#. Using ``internalClient``, drop the ``db.coll`` collection.
#. Using ``internalClient``, set the following fail point:

   .. code:: javascript

       {
           configureFailPoint: "failCommand",
           mode: "alwaysOn",
           data: {
               failCommands: ["getMore"],
               blockConnection: true,
               blockTimeMS: 15
           }
       }

#. Create a new MongoClient (referred to as ``client``) with ``timeoutMS=20``.
#. Using ``client``, use the ``watch`` helper to create a change stream against ``db.coll``.

   - Expect this to succeed and return a change stream with a non-zero ID.

#. Call the blocking iteration method on the resulting change stream.

   - Expect this to fail with a timeout error.

#. Verify that an ``aggregate`` command and two ``getMore`` commands were executed against the ``db.coll`` collection during the test.

6. GridFS - Upload
~~~~~~~~~~~~~~~~~~

Tests in this section MUST only be run against server versions 4.4 and higher.

uploads via openUploadStream can be timed out
`````````````````````````````````````````````

#. Using ``internalClient``, drop and re-create the ``db.fs.files`` and ``db.fs.chunks`` collections.
#. Using ``internalClient``, set the following fail point:

   .. code:: javascript

       {
           configureFailPoint: "failCommand",
           mode: { times: 1 },
           data: {
               failCommands: ["insert"],
               blockConnection: true,
               blockTimeMS: 15
           }
       }

#. Create a new MongoClient (referred to as ``client``) with ``timeoutMS=10``.
#. Using ``client``, create a GridFS bucket (referred to as ``bucket``) that wraps the ``db`` database.
#. Call ``bucket.open_upload_stream()`` with the filename ``filename`` to create an upload stream (referred to as ``uploadStream``).

   - Expect this to succeed and return a non-null stream.

#. Using ``uploadStream``, upload a single ``0x12`` byte.
#. Call ``uploadStream.close()`` to flush the stream and insert chunks.

   - Expect this to fail with a timeout error.

Aborting an upload stream can be timed out
``````````````````````````````````````````

This test only applies to drivers that provide an API to abort a GridFS upload stream.

#. Using ``internalClient``, drop and re-create the ``db.fs.files`` and ``db.fs.chunks`` collections.
#. Using ``internalClient``, set the following fail point:

   .. code:: javascript

       {
           configureFailPoint: "failCommand",
           mode: { times: 1 },
           data: {
               failCommands: ["delete"],
               blockConnection: true,
               blockTimeMS: 15
           }
       }

#. Create a new MongoClient (referred to as ``client``) with ``timeoutMS=10``.
#. Using ``client``, create a GridFS bucket (referred to as ``bucket``) that wraps the ``db`` database with ``chunkSizeBytes=2``.
#. Call ``bucket.open_upload_stream()`` with the filename ``filename`` to create an upload stream (referred to as ``uploadStream``).

   - Expect this to succeed and return a non-null stream.

#. Using ``uploadStream``, upload the bytes ``[0x01, 0x02, 0x03, 0x04]``.
#. Call ``uploadStream.abort()``.

   - Expect this to fail with a timeout error.

7. GridFS - Download
~~~~~~~~~~~~~~~~~~~~

This test MUST only be run against server versions 4.4 and higher.

#. Using ``internalClient``, drop and re-create the ``db.fs.files`` and ``db.fs.chunks`` collections.
#. Using ``internalClient``, insert the following document into the ``db.fs.files`` collection:

   .. code:: javascript

       {
          "_id": {
            "$oid": "000000000000000000000005"
          },
          "length": 10,
          "chunkSize": 4,
          "uploadDate": {
            "$date": "1970-01-01T00:00:00.000Z"
          },
          "md5": "57d83cd477bfb1ccd975ab33d827a92b",
          "filename": "length-10",
          "contentType": "application/octet-stream",
          "aliases": [],
          "metadata": {}
       }

#. Create a new MongoClient (referred to as ``client``) with ``timeoutMS=10``.
#. Using ``client``, create a GridFS bucket (referred to as ``bucket``) that wraps the ``db`` database.
#. Call ``bucket.open_download_stream`` with the id ``{ "$oid": "000000000000000000000005" }`` to create a download stream (referred to as ``downloadStream``).

   - Expect this to succeed and return a non-null stream.

#. Using ``internalClient``, set the following fail point:

   .. code:: javascript

       {
           configureFailPoint: "failCommand",
           mode: { times: 1 },
           data: {
               failCommands: ["find"],
               blockConnection: true,
               blockTimeMS: 15
           }
       }

#. Read from the ``downloadStream``.

   - Expect this to fail with a timeout error.

#. Verify that two ``find`` commands were executed during the read: one against ``db.fs.files`` and another against ``db.fs.chunks``.

8. Server Selection
~~~~~~~~~~~~~~~~~~~

serverSelectionTimeoutMS honored if timeoutMS is not set
````````````````````````````````````````````````````````

#. Create a MongoClient (referred to as ``client``) with URI ``mongodb://invalid/?serverSelectionTimeoutMS=10``.

#. Using ``client``, execute the command ``{ ping: 1 }`` against the ``admin`` database.

   - Expect this to fail with a server selection timeout error after no more than 15ms.

timeoutMS honored for server selection if it's lower than serverSelectionTimeoutMS
``````````````````````````````````````````````````````````````````````````````````

#. Create a MongoClient (referred to as ``client``) with URI ``mongodb://invalid/?timeoutMS=10&serverSelectionTimeoutMS=20``.

#. Using ``client``, run the command ``{ ping: 1 }`` against the ``admin`` database.

   - Expect this to fail with a server selection timeout error after no more than 15ms.

serverSelectionTimeoutMS honored for server selection if it's lower than timeoutMS
``````````````````````````````````````````````````````````````````````````````````

#. Create a MongoClient (referred to as ``client``) with URI ``mongodb://invalid/?timeoutMS=20&serverSelectionTimeoutMS=10``.

#. Using ``client``, run the command ``{ ping: 1 }`` against the ``admin`` database.

   - Expect this to fail with a server selection timeout error after no more than 15ms.

serverSelectionTimeoutMS honored for server selection if timeoutMS=0
````````````````````````````````````````````````````````````````````

#. Create a MongoClient (referred to as ``client``) with URI ``mongodb://invalid/?timeoutMS=0&serverSelectionTimeoutMS=10``.

#. Using ``client``, run the command ``{ ping: 1 }`` against the ``admin`` database.

   - Expect this to fail with a server selection timeout error after no more than 15ms.

timeoutMS honored for connection handshake commands if it's lower than serverSelectionTimeoutMS
```````````````````````````````````````````````````````````````````````````````````````````````

This test MUST only be run if the server version is 4.4 or higher and the URI has authentication fields (i.e. a
username and password).

#. Using ``internalClient``, set the following fail point:

   .. code:: javascript

       {
           configureFailPoint: failCommand,
           mode: { times: 1 },
           data: {
               failCommands: ["saslContinue"],
               blockConnection: true,
               blockTimeMS: 15
           }
       }

#. Create a new MongoClient (referred to as ``client``) with ``timeoutMS=10`` and ``serverSelectionTimeoutMS=20``.
#. Using ``client``, insert the document ``{ x: 1 }`` into collection ``db.coll``.

   - Expect this to fail with a timeout error after no more than 15ms.

serverSelectionTimeoutMS honored for connection handshake commands if it's lower than timeoutMS
```````````````````````````````````````````````````````````````````````````````````````````````

This test MUST only be run if the server version is 4.4 or higher and the URI has authentication fields (i.e. a
username and password).

#. Using ``internalClient``, set the following fail point:

   .. code:: javascript

       {
           configureFailPoint: failCommand,
           mode: { times: 1 },
           data: {
               failCommands: ["saslContinue"],
               blockConnection: true,
               blockTimeMS: 15
           }
       }

#. Create a new MongoClient (referred to as ``client``) with ``timeoutMS=20`` and ``serverSelectionTimeoutMS=10``.
#. Using ``client``, insert the document ``{ x: 1 }`` into collection ``db.coll``.

   - Expect this to fail with a timeout error after no more than 15ms.

9. endSession
~~~~~~~~~~~~~

This test MUST only be run against replica sets and sharded clusters with server version 4.4 or higher. It MUST be
run three times: once with the timeout specified via the MongoClient ``timeoutMS`` option, once with the timeout
specified via the ClientSession ``defaultTimeoutMS`` option, and once more with the timeout specified via the
``timeoutMS`` option for the ``endSession`` operation. In all cases, the timeout MUST be set to 10 milliseconds.

#. Using ``internalClient``, drop the ``db.coll`` collection.
#. Using ``internalClient``, set the following fail point:

   .. code:: javascript

       {
           configureFailPoint: failCommand,
           mode: { times: 1 },
           data: {
               failCommands: ["abortTransaction"],
               blockConnection: true,
               blockTimeMS: 15
           }
       }

#. Create a new MongoClient (referred to as ``client``) and an explicit ClientSession derived from that MongoClient (referred to as ``session``).
#. Execute the following code:

   .. code:: typescript

       coll = client.database("db").collection("coll")
       session.start_transaction()
       coll.insert_one({x: 1}, session=session)

#. Using ``session``, execute ``session.end_session``

   - Expect this to fail with a timeout error after no more than 15ms.

10. Convenient Transactions
~~~~~~~~~~~~~~~~~~~~~~~~~~~

Tests in this section MUST only run against replica sets and sharded clusters with server versions 4.4 or higher.

timeoutMS is refreshed for abortTransaction if the callback fails
`````````````````````````````````````````````````````````````````

#. Using ``internalClient``, drop the ``db.coll`` collection.
#. Using ``internalClient``, set the following fail point:

   .. code:: javascript

       {
           configureFailPoint: failCommand,
           mode: { times: 2 },
           data: {
               failCommands: ["insert", "abortTransaction"],
               blockConnection: true,
               blockTimeMS: 15
           }
       }

#. Create a new MongoClient (referred to as ``client``) configured with ``timeoutMS=10`` and an explicit ClientSession derived from that MongoClient (referred to as ``session``).
#. Using ``session``, execute a ``withTransaction`` operation with the following callback:

   .. code:: typescript

       def callback() {
           coll = client.database("db").collection("coll")
           coll.insert_one({ _id: 1 }, session=session)
       }

#. Expect the previous ``withTransaction`` call to fail with a timeout error.
#. Verify that the following events were published during the ``withTransaction`` call:

   #. ``command_started`` and ``command_failed`` events for an ``insert`` command.
   #. ``command_started`` and ``command_failed`` events for an ``abortTransaction`` command.

Unit Tests
==========

The tests enumerated in this section could not be expressed in either spec or prose format. Drivers SHOULD implement
these if it is possible to do so using the driver's existing test infrastructure.

- Operations should ignore ``waitQueueTimeoutMS`` if ``timeoutMS`` is also set.
- If ``timeoutMS`` is set for an operation, the remaining ``timeoutMS`` value should apply to connection checkout after a server has been selected.
- If ``timeoutMS`` is not set for an operation, ``waitQueueTimeoutMS`` should apply to connection checkout after a server has been selected.
- If a new connection is required to execute an operation, ``min(remaining computedServerSelectionTimeout, connectTimeoutMS)`` should apply to socket establishment.
- For drivers that have control over OCSP behavior, ``min(remaining computedServerSelectionTimeout, 5 seconds)`` should apply to HTTP requests against OCSP responders.
- If ``timeoutMS`` is unset, operations fail after two non-consecutive socket timeouts.
- The remaining ``timeoutMS`` value should apply to HTTP requests against KMS servers for CSFLE.
- The remaining ``timeoutMS`` value should apply to commands sent to mongocryptd as part of automatic encryption.
- When doing ``minPoolSize`` maintenance, ``connectTimeoutMS`` is used as the timeout for socket establishment.
