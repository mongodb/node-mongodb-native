============================
Client Side Encryption Tests
============================

.. contents::

----

Introduction
============

This document describes the format of the driver spec tests included in the JSON
and YAML files included in this directory.

Additional prose tests, that are not represented in the spec tests, are described
and MUST be implemented by all drivers.

Spec Test Format
================

The spec tests format is an extension of `transactions spec tests <https://github.com/mongodb/specifications/blob/master/source/transactions/tests/README.rst>`_ with some additions:

- A ``json_schema`` to set on the collection used for operations.

- A ``key_vault_data`` of data that should be inserted in the key vault collection before each test.

- Introduction ``client_side_encryption_opts`` to `clientOptions`

- Addition of `$db` to command in `command_started_event`

- Addition of `$$type` to command_started_event and outcome.

The semantics of `$$type` is that any actual value matching the BSON type indicated by the BSON type string is considered a match.

For example, the following matches a command_started_event for an insert of a document where `random` must be of type ``binData``::

  - command_started_event:
      command:
        insert: *collection_name
        documents:
          - { random: { $$type: "binData" } }
        ordered: true
      command_name: insert


The values of `$$type` correspond to `these documented string representations of BSON types <https://docs.mongodb.com/manual/reference/bson-types/>`_.


Each YAML file has the following keys:

.. |txn| replace:: Unchanged from Transactions spec tests.

- ``runOn`` |txn|

- ``database_name`` |txn|

- ``collection_name`` |txn|

- ``data`` |txn|

- ``json_schema`` A JSON Schema that should be set on the collection (using ``createCollection``) before each test run.

- ``key_vault_data`` The data that should exist in the key vault collection under test before each test run.

- ``tests``: An array of tests that are to be run independently of each other.
  Each test will have some or all of the following fields:

  - ``description``: |txn|

  - ``skipReason``: |txn|

  - ``clientOptions``: Optional, parameters to pass to MongoClient().

    - ``auto_encrypt_opts``: Optional

      - ``kms_providers`` A dictionary of KMS providers to set on the key vault ("aws" or "local")

        - ``aws`` The AWS KMS provider. An empty object. Drivers MUST fill in AWS credentials from the environment.

        - ``local`` The local KMS provider.

          - ``key`` A 96 byte local key.

      - ``schema_map``: Optional, a map from namespaces to local JSON schemas.

      - ``keyVaultNamespace``: Optional, a namespace to the key vault collection. Defaults to "admin.datakeys".

  - ``operations``: Array of documents, each describing an operation to be
    executed. Each document has the following fields:

    - ``name``: |txn|

    - ``object``: |txn|

    - ``collectionOptions``: |txn|

    - ``command_name``: |txn|

    - ``arguments``: |txn|

    - ``result``: |txn|

  - ``expectations``: |txn|

  - ``outcome``: |txn|



Use as integration tests
========================

Do the following before running spec tests:

- Start the mongocryptd process.
- Start a mongod process with **server version 4.1.9 or later**.
- Place credentials to an AWS IAM user (access key ID + secret access key) somewhere in the environment outside of tracked code. (If testing on evergreen, project variables are a good place).

Load each YAML (or JSON) file using a Canonical Extended JSON parser.

Then for each element in ``tests``:

#. If the ``skipReason`` field is present, skip this test completely.
#. If the ``key_vault_data`` field is present:

   #. Drop the ``admin.datakeys`` collection using writeConcern "majority".
   #. Insert the data specified into the ``admin.datakeys`` with write concern "majority".

#. Create a MongoClient using ``clientOptions``.

   #. If ``autoEncryptOpts`` includes ``aws`` as a KMS provider, pass in AWS credentials from the environment.
   #. If ``autoEncryptOpts`` does not include ``keyVaultNamespace``, default it to ``admin.datakeys``
   
#. Create a collection object from the MongoClient, using the ``database_name``
   and ``collection_name`` fields from the YAML file.
#. Drop the test collection, using writeConcern "majority".
#. If the YAML file contains a ``data`` array, insert the documents in ``data``
   into the test collection, using writeConcern "majority".

#. Set Command Monitoring listeners on the MongoClient.
#. For each element in ``operations``:

   - Enter a "try" block or your programming language's closest equivalent.
   - Create a Database object from the MongoClient, using the ``database_name``
     field at the top level of the test file.
   - Create a Collection object from the Database, using the
     ``collection_name`` field at the top level of the test file.
     If ``collectionOptions`` is present create the Collection object with the
     provided options. Otherwise create the object with the default options.
   - Execute the named method on the provided ``object``, passing the
     arguments listed.
   - If the driver throws an exception / returns an error while executing this
     series of operations, store the error message and server error code.
   - If the result document has an "errorContains" field, verify that the
     method threw an exception or returned an error, and that the value of the
     "errorContains" field matches the error string. "errorContains" is a
     substring (case-insensitive) of the actual error message.

     If the result document has an "errorCodeName" field, verify that the
     method threw a command failed exception or returned an error, and that
     the value of the "errorCodeName" field matches the "codeName" in the
     server error response.

     If the result document has an "errorLabelsContain" field, verify that the
     method threw an exception or returned an error. Verify that all of the
     error labels in "errorLabelsContain" are present in the error or exception
     using the ``hasErrorLabel`` method.

     If the result document has an "errorLabelsOmit" field, verify that the
     method threw an exception or returned an error. Verify that none of the
     error labels in "errorLabelsOmit" are present in the error or exception
     using the ``hasErrorLabel`` method.
   - If the operation returns a raw command response, eg from ``runCommand``,
     then compare only the fields present in the expected result document.
     Otherwise, compare the method's return value to ``result`` using the same
     logic as the CRUD Spec Tests runner.

#. If the test includes a list of command-started events in ``expectations``,
   compare them to the actual command-started events using the
   same logic as the Command Monitoring Spec Tests runner.

#. For each element in ``outcome``:

   - If ``name`` is "collection", create a new MongoClient *without encryption*
     and verify that the test collection contains exactly the documents in the 
     ``data`` array. Ensure this find reads the latest data by using
     **primary read preference** with **local read concern** even when the
     MongoClient is configured with another read preference or read concern.

The spec test MUST be run with *and* without auth.

Prose Tests
===========

Tests for the ClientEncryption type are not included as part of the YAML tests.

First, perform the setup.

#. Create a MongoClient without encryption enabled (referred to as ``client``).

#. Using ``client``, drop the collections ``admin.datakeys`` and ``db.coll``.

#. Create the following:

   - A MongoClient configured with auto encryption (referred to as ``client_encrypted``)
   - A ``ClientEncryption`` object (referred to as ``client_encryption``)

   Configure both objects with ``aws`` and the ``local`` KMS providers as follows:

   .. code:: javascript

      {
          "aws": { <AWS credentials> },
          "local": { "key": <base64 decoding of LOCAL_MASTERKEY> }
      }

   Where LOCAL_MASTERKEY is the following base64:

   .. code:: javascript

      Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk

   Configure both objects with ``keyVaultNamespace`` set to ``admin.datakeys``.

   Configure the ``MongoClient`` with the following ``schema_map``:

   .. code:: javascript

      {
        "db.coll": {
          "bsonType": "object",
          "properties": {
            "encrypted_placeholder": {
              "encrypt": {
                "keyId": "/placeholder",
                "bsonType": "string",
                "algorithm": "AEAD_AES_256_CBC_HMAC_SHA_512-Random"
              }
            }
          }
        }
      }

Then, test creating and using data keys from a ``local`` KMS provider:

#. Call ``client_encryption.createDataKey()`` with the ``local`` KMS provider and keyAltNames set to ``["local_altname"]``.

   - Expect a BSON binary with subtype 4 to be returned, referred to as ``local_datakey_id``.
   - Use ``client`` to run a ``find`` on ``admin.datakeys`` by querying with the ``_id`` set to the ``local_datakey_id``.
   - Expect that exactly one document is returned with the "masterKey.provider" equal to "local".

#. Call ``client_encryption.encrypt()`` with the value "hello local", the algorithm ``AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic``, and the ``key_id`` of ``local_datakey_id``.

   - Expect the return value to be a BSON binary subtype 6, referred to as ``local_encrypted``.
   - Use ``client_encrypted`` to insert ``{ _id: "local", "value": <local_encrypted> }`` into ``db.coll``.
   - Use ``client_encrypted`` to run a find querying with ``_id`` of "local" and expect ``value`` to be "hello local".

#. Call ``client_encryption.encrypt()`` with the value "hello local", the algorithm ``AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic``, and the ``key_alt_name`` of ``local_altname``.

   - Expect the return value to be a BSON binary subtype 6. Expect the value to exactly match the value of ``local_encrypted``.

Then, repeat the above tests with the ``aws`` KMS provider:

#. Call ``client_encryption.createDataKey()`` with the ``aws`` KMS provider, keyAltNames set to ``["aws_altname"]``, and ``masterKey`` as follows:

   .. code:: javascript

      {
        region: "us-east-1",
        key: "arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0"
      }


   - Expect a BSON binary with subtype 4 to be returned, referred to as ``aws_datakey_id``.
   - Use ``client`` to run a ``find`` on ``admin.datakeys`` by querying with the ``_id`` set to the ``aws_datakey_id``.
   - Expect that exactly one document is returned with the "masterKey.provider" equal to "aws".

#. Call ``client_encryption.encrypt()`` with the value "hello aws", the algorithm ``AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic``, and the ``key_id`` of ``aws_datakey_id``.

   - Expect the return value to be a BSON binary subtype 6, referred to as ``aws_encrypted``.
   - Use ``client_encrypted`` to insert ``{ _id: "aws", "value": <aws_encrypted> }`` into ``db.coll``.
   - Use ``client_encrypted`` to run a find querying with ``_id`` of "aws" and expect ``value`` to be "hello aws".

#. Call ``client_encryption.encrypt()`` with the value "hello aws", the algorithm ``AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic``, and the ``key_alt_name`` of ``aws_altname``.

   - Expect the return value to be a BSON binary subtype 6. Expect the value to exactly match the value of ``aws_encrypted``.


Then, run the following final tests:

#. Test explicit encrypting an auto encrypted field.

   - Use ``client_encrypted`` to attempt to insert ``{ "encrypted_placeholder": (local_encrypted) }``
   - Expect an exception to be thrown, since this is an attempt to auto encrypt an already encrypted value.


Corpus Test
===========

The corpus test exhaustively enumerates all ways to encrypt all BSON value types. Note, the test data includes BSON binary subtype 4 (or standard UUID), which MUST be decoded and encoded as subtype 4. Run the test as follows.

1. Create a MongoClient without encryption enabled (referred to as ``client``).

2. Using ``client``, drop and create the collection ``db.coll`` configured with the included JSON schema `corpus/corpus-schema.json <corpus/corpus-schema.json>`_.

3. Using ``client``, drop the collection ``admin.datakeys``. Insert the documents `corpus/corpus-key-local.json <corpus/corpus-key-local.json>`_ and `corpus/corpus-key-aws.json <corpus/corpus-key-aws.json>`_.

4. Create the following:

   - A MongoClient configured with auto encryption (referred to as ``client_encrypted``)
   - A ``ClientEncryption`` object (referred to as ``client_encryption``)

   Configure both objects with ``aws`` and the ``local`` KMS providers as follows:

   .. code:: javascript

      {
          "aws": { <AWS credentials> },
          "local": { "key": <base64 decoding of LOCAL_MASTERKEY> }
      }

   Where LOCAL_MASTERKEY is the following base64:
   
   .. code:: javascript

      Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk

   Configure both objects with ``keyVaultNamespace`` set to ``admin.datakeys``.

5. Load `corpus/corpus.json <corpus/corpus.json>`_ to a variable named ``corpus``. The corpus contains subdocuments with the following fields:

   - ``kms`` is either ``aws`` or ``local``
   - ``type`` is a BSON type string `names coming from here <https://docs.mongodb.com/manual/reference/operator/query/type/>`_)
   - ``algo`` is either ``rand`` or ``det`` for random or deterministic encryption
   - ``method`` is either ``auto``, for automatic encryption or ``explicit`` for  explicit encryption
   - ``identifier`` is either ``id`` or ``altname`` for the key identifier
   - ``allowed`` is a boolean indicating whether the encryption for the given parameters is permitted.
   - ``value`` is the value to be tested.

   Create a new BSON document, named ``corpus_copied``.
   Iterate over each field of ``corpus``.

   - If the field name is ``_id``, ``altname_aws`` and ``altname_local``, copy the field to ``corpus_copied``.
   - If ``method`` is ``auto``, copy the field to ``corpus_copied``.
   - If ``method`` is ``explicit``, use ``client_encryption`` to explicitly encrypt the value.
   
     - Encrypt with the algorithm described by ``algo``.
     - If ``identifier`` is ``id``
        - If ``kms`` is ``local`` set the key_id to the UUID with base64 value ``LOCALAAAAAAAAAAAAAAAAA==``.
        - If ``kms`` is ``aws`` set the key_id to the UUID with base64 value ``AWSAAAAAAAAAAAAAAAAAAA==``.
     - If ``identifier`` is ``altname``
        - If ``kms`` is ``local`` set the key_alt_name to "local".
        - If ``kms`` is ``aws`` set the key_alt_name to "aws".
     
     If ``allowed`` is true, copy the field and encrypted value to ``corpus_copied``.
     If ``allowed`` is false. verify that an exception is thrown. Copy the unencrypted value to to ``corpus_copied``.


6. Using ``client_encrypted``, insert ``corpus_copied`` into ``db.coll``.

7. Using ``client_encrypted``, find the inserted document from ``db.coll`` to a variable named ``corpus_decrypted``. Since it should have been automatically decrypted, assert the document exactly matches ``corpus``.

8. Load `corpus/corpus_encrypted.json <corpus/corpus-encrypted.json>`_ to a variable named ``corpus_encrypted_expected``.
   Using ``client`` find the inserted document from ``db.coll`` to a variable named ``corpus_encrypted_actual``.

   Iterate over each field of ``corpus_encrypted_expected`` and check the following:

   - If the ``algo`` is ``det``, that the value exactly matches all fields in ``corpus_encrypted_actual`` with the same ``kms``, ``type``, and ``algo``.
   - If the ``algo`` is ``rand`` and ``allowed`` is true, that the value does not match any fields in ``corpus_encrypted_actual`` with the same ``kms`` and ``type``.
   - If the ``method`` is ``auto`` or ``explicit``, decrypt the value with ``client_encryption`` and validate the value exactly matches the corresponding field of ``corpus``.
   - If the ``allowed`` is false, validate the value exactly matches the corresponding field of ``corpus``.

9. Repeat steps 1-8 with a local JSON schema. I.e. amend step 4 to configure the schema on ``client_encrypted`` and ``client_encryption`` with the ``schema_map`` option.

   
