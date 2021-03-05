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

- Introduction ``autoEncryptOpts`` to `clientOptions`

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

    - ``autoEncryptOpts``: Optional

      - ``kmsProviders`` A dictionary of KMS providers to set on the key vault ("aws" or "local")

        - ``aws`` The AWS KMS provider. An empty object. Drivers MUST fill in AWS credentials (`accessKeyId`, `secretAccessKey`) from the environment.

        - ``azure`` The Azure KMS provider credentials. An empty object. Drivers MUST fill in Azure credentials (`tenantId`, `clientId`, and `clientSecret`) from the environment.

        - ``gcp`` The GCP KMS provider credentials. An empty object. Drivers MUST fill in GCP credentials (`email`, `privateKey`) from the environment.

        - ``local`` The local KMS provider.

          - ``key`` A 96 byte local key.

      - ``schemaMap``: Optional, a map from namespaces to local JSON schemas.

      - ``keyVaultNamespace``: Optional, a namespace to the key vault collection. Defaults to "keyvault.datakeys".

      - ``bypassAutoEncryption``: Optional, a boolean to indicate whether or not auto encryption should be bypassed. Defaults to ``false``.

  - ``operations``: Array of documents, each describing an operation to be
    executed. Each document has the following fields:

    - ``name``: |txn|

    - ``object``: |txn|. Defaults to "collection" if omitted.

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

   #. Drop the ``keyvault.datakeys`` collection using writeConcern "majority".
   #. Insert the data specified into the ``keyvault.datakeys`` with write concern "majority".

#. Create a MongoClient.

#. Create a collection object from the MongoClient, using the ``database_name``
   and ``collection_name`` fields from the YAML file. Drop the collection 
   with writeConcern "majority". If a ``json_schema`` is defined in the test,
   use the ``createCollection`` command to explicitly create the collection:

   .. code:: typescript

      {"create": <collection>, "validator": {"$jsonSchema": <json_schema>}}

#. If the YAML file contains a ``data`` array, insert the documents in ``data``
   into the test collection, using writeConcern "majority".

#. Create a **new** MongoClient using ``clientOptions``.

   #. If ``autoEncryptOpts`` includes ``aws``, ``azure``, and/or ``gcp`` as a KMS provider, pass in credentials from the environment.
   #. If ``autoEncryptOpts`` does not include ``keyVaultNamespace``, default it to ``keyvault.datakeys``.

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

In the prose tests LOCAL_MASTERKEY refers to the following base64:

.. code:: javascript

  Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk

Perform all applicable operations on key vault collections (e.g. inserting an example data key, or running a find command) with readConcern/writeConcern "majority".

Data key and double encryption
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

First, perform the setup.

#. Create a MongoClient without encryption enabled (referred to as ``client``). Enable command monitoring to listen for command_started events.

#. Using ``client``, drop the collections ``keyvault.datakeys`` and ``db.coll``.

#. Create the following:

   - A MongoClient configured with auto encryption (referred to as ``client_encrypted``)
   - A ``ClientEncryption`` object (referred to as ``client_encryption``)

   Configure both objects with the following KMS providers:

   .. code:: javascript

      {
         "aws": {
            "accessKeyId": <set from environment>,
            "secretAccessKey": <set from environment>
         },
         "azure": {
            "tenantId": <set from environment>,
            "clientId": <set from environment>,
            "clientSecret": <set from environment>,
         },
            "gcp": {
            "email": <set from environment>,
            "privateKey": <set from environment>,
         }
         "local": { "key": <base64 decoding of LOCAL_MASTERKEY> }
      }

   Configure both objects with ``keyVaultNamespace`` set to ``keyvault.datakeys``.

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

   Configure ``client_encryption`` with the ``keyVaultClient`` of the previously created ``client``.

For each KMS provider (``aws``, ``azure``, ``gcp``, and ``local``), referred to as ``provider_name``, run the following test.

#. Call ``client_encryption.createDataKey()``.

   - Set keyAltNames to ``["<provider_name>_altname"]``.
   - Set the masterKey document based on ``provider_name``.

     For "aws":

     .. code:: javascript

        {
          region: "us-east-1",
          key: "arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0"
        }

     For "azure":

     .. code:: javascript

        {
          "keyVaultEndpoint": "key-vault-csfle.vault.azure.net",
          "keyName": "key-name-csfle"
        }

     For "gcp":

     .. code:: javascript

        {
          "projectId": "devprod-drivers",
          "location": "global",
          "keyRing": "key-ring-csfle",
          "keyName": "key-name-csfle"
        }

     For "local", do not set a masterKey document.
   - Expect a BSON binary with subtype 4 to be returned, referred to as ``datakey_id``.
   - Use ``client`` to run a ``find`` on ``keyvault.datakeys`` by querying with the ``_id`` set to the ``datakey_id``.
   - Expect that exactly one document is returned with the "masterKey.provider" equal to ``provider_name``.
   - Check that ``client`` captured a command_started event for the ``insert`` command containing a majority writeConcern.

#. Call ``client_encryption.encrypt()`` with the value "hello <provider_name>", the algorithm ``AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic``, and the ``key_id`` of ``datakey_id``.

   - Expect the return value to be a BSON binary subtype 6, referred to as ``encrypted``.
   - Use ``client_encrypted`` to insert ``{ _id: "<provider_name>", "value": <encrypted> }`` into ``db.coll``.
   - Use ``client_encrypted`` to run a find querying with ``_id`` of "<provider_name>" and expect ``value`` to be "hello <provider_name>".

#. Call ``client_encryption.encrypt()`` with the value "hello <provider_name>", the algorithm ``AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic``, and the ``key_alt_name`` of ``<provider_name>_altname``.

   - Expect the return value to be a BSON binary subtype 6. Expect the value to exactly match the value of ``encrypted``.

#. Test explicit encrypting an auto encrypted field.

   - Use ``client_encrypted`` to attempt to insert ``{ "encrypted_placeholder": <encrypted> }``
   - Expect an exception to be thrown, since this is an attempt to auto encrypt an already encrypted value.



External Key Vault Test
~~~~~~~~~~~~~~~~~~~~~~~

Run the following tests twice, parameterized by a boolean ``withExternalKeyVault``.

#. Create a MongoClient without encryption enabled (referred to as ``client``).

#. Using ``client``, drop the collections ``keyvault.datakeys`` and ``db.coll``.
   Insert the document `external/external-key.json <../external/external-key.json>`_ into ``keyvault.datakeys``.

#. Create the following:

   - A MongoClient configured with auto encryption (referred to as ``client_encrypted``)
   - A ``ClientEncryption`` object (referred to as ``client_encryption``)

   Configure both objects with the ``local`` KMS providers as follows:

   .. code:: javascript

      { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } }

   Configure both objects with ``keyVaultNamespace`` set to ``keyvault.datakeys``.

   Configure ``client_encrypted`` to use the schema `external/external-schema.json <../external/external-schema.json>`_  for ``db.coll`` by setting a schema map like: ``{ "db.coll": <contents of external-schema.json>}``

   If ``withExternalKeyVault == true``, configure both objects with an external key vault client. The external client MUST connect to the same
   MongoDB cluster that is being tested against, except it MUST use the username ``fake-user`` and password ``fake-pwd``.

#. Use ``client_encrypted`` to insert the document ``{"encrypted": "test"}`` into ``db.coll``.
   If ``withExternalKeyVault == true``, expect an authentication exception to be thrown. Otherwise, expect the insert to succeed.

#. Use ``client_encryption`` to explicitly encrypt the string ``"test"`` with key ID ``LOCALAAAAAAAAAAAAAAAAA==`` and deterministic algorithm.
   If ``withExternalKeyVault == true``, expect an authentication exception to be thrown. Otherwise, expect the insert to succeed.


BSON size limits and batch splitting
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

First, perform the setup.

#. Create a MongoClient without encryption enabled (referred to as ``client``).

#. Using ``client``, drop and create the collection ``db.coll`` configured with the included JSON schema `limits/limits-schema.json <../limits/limits-schema.json>`_.

#. Using ``client``, drop the collection ``keyvault.datakeys``. Insert the document `limits/limits-key.json <../limits/limits-key.json>`_

#. Create a MongoClient configured with auto encryption (referred to as ``client_encrypted``)

   Configure with the ``local`` KMS provider as follows:

   .. code:: javascript

      { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } }

   Configure with the ``keyVaultNamespace`` set to ``keyvault.datakeys``.

Using ``client_encrypted`` perform the following operations:

#. Insert ``{ "_id": "over_2mib_under_16mib", "unencrypted": <the string "a" repeated 2097152 times> }``.

   Expect this to succeed since this is still under the ``maxBsonObjectSize`` limit.

#. Insert the document `limits/limits-doc.json <../limits/limits-doc.json>`_ concatenated with ``{ "_id": "encryption_exceeds_2mib", "unencrypted": < the string "a" repeated (2097152 - 2000) times > }``
   Note: limits-doc.json is a 1005 byte BSON document that encrypts to a ~10,000 byte document.

   Expect this to succeed since after encryption this still is below the normal maximum BSON document size.
   Note, before auto encryption this document is under the 2 MiB limit. After encryption it exceeds the 2 MiB limit, but does NOT exceed the 16 MiB limit.

#. Bulk insert the following:

   - ``{ "_id": "over_2mib_1", "unencrypted": <the string "a" repeated (2097152) times> }``

   - ``{ "_id": "over_2mib_2", "unencrypted": <the string "a" repeated (2097152) times> }``

   Expect the bulk write to succeed and split after first doc (i.e. two inserts occur). This may be verified using `command monitoring <https://github.com/mongodb/specifications/tree/master/source/command-monitoring/command-monitoring.rst>`_.

#. Bulk insert the following:

   - The document `limits/limits-doc.json <../limits/limits-doc.json>`_ concatenated with ``{ "_id": "encryption_exceeds_2mib_1", "unencrypted": < the string "a" repeated (2097152 - 2000) times > }``

   - The document `limits/limits-doc.json <../limits/limits-doc.json>`_ concatenated with ``{ "_id": "encryption_exceeds_2mib_2", "unencrypted": < the string "a" repeated (2097152 - 2000) times > }``

   Expect the bulk write to succeed and split after first doc (i.e. two inserts occur). This may be verified using `command monitoring <https://github.com/mongodb/specifications/tree/master/source/command-monitoring/command-monitoring.rst>`_.

#. Insert ``{ "_id": "under_16mib", "unencrypted": <the string "a" repeated 16777216 - 2000 times>``.

   Expect this to succeed since this is still (just) under the ``maxBsonObjectSize`` limit.

#. Insert the document `limits/limits-doc.json <../limits/limits-doc.json>`_ concatenated with ``{ "_id": "encryption_exceeds_16mib", "unencrypted": < the string "a" repeated (16777216 - 2000) times > }``

   Expect this to fail since encryption results in a document exceeding the ``maxBsonObjectSize`` limit.

Optionally, if it is possible to mock the maxWriteBatchSize (i.e. the maximum number of documents in a batch) test that setting maxWriteBatchSize=1 and inserting the two documents ``{ "_id": "a" }, { "_id": "b" }`` with ``client_encrypted`` splits the operation into two inserts.


Views are prohibited
~~~~~~~~~~~~~~~~~~~~

#. Create a MongoClient without encryption enabled (referred to as ``client``).

#. Using ``client``, drop and create a view named ``db.view`` with an empty pipeline. E.g. using the command ``{ "create": "view", "viewOn": "coll" }``.

#. Create a MongoClient configured with auto encryption (referred to as ``client_encrypted``)

   Configure with the ``local`` KMS provider as follows:

   .. code:: javascript

      { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } }

   Configure with the ``keyVaultNamespace`` set to ``keyvault.datakeys``.

#. Using ``client_encrypted``, attempt to insert a document into ``db.view``. Expect an exception to be thrown containing the message: "cannot auto encrypt a view".


Corpus Test
~~~~~~~~~~~

The corpus test exhaustively enumerates all ways to encrypt all BSON value types. Note, the test data includes BSON binary subtype 4 (or standard UUID), which MUST be decoded and encoded as subtype 4. Run the test as follows.

1. Create a MongoClient without encryption enabled (referred to as ``client``).

2. Using ``client``, drop and create the collection ``db.coll`` configured with the included JSON schema `corpus/corpus-schema.json <../corpus/corpus-schema.json>`_.

3. Using ``client``, drop the collection ``keyvault.datakeys``. Insert the documents `corpus/corpus-key-local.json <../corpus/corpus-key-local.json>`_, `corpus/corpus-key-aws.json <../corpus/corpus-key-aws.json>`_, `corpus/corpus-key-azure.json <../corpus/corpus-key-azure.json>`_, and `corpus/corpus-key-gcp.json <../corpus/corpus-key-gcp.json>`_.

4. Create the following:

   - A MongoClient configured with auto encryption (referred to as ``client_encrypted``)
   - A ``ClientEncryption`` object (referred to as ``client_encryption``)

   Configure both objects with ``aws``, ``azure``, ``gcp``, and ``local`` KMS providers as follows:

   .. code:: javascript

      {
          "aws": { <AWS credentials> },
          "azure": { <Azure credentials> },
          "gcp": { <GCP credentials> },
          "local": { "key": <base64 decoding of LOCAL_MASTERKEY> }
      }

   Where LOCAL_MASTERKEY is the following base64:

   .. code:: javascript

      Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk

   Configure both objects with ``keyVaultNamespace`` set to ``keyvault.datakeys``.

5. Load `corpus/corpus.json <../corpus/corpus.json>`_ to a variable named ``corpus``. The corpus contains subdocuments with the following fields:

   - ``kms`` is either ``aws``, ``azure``, ``gcp``, or ``local``
   - ``type`` is a BSON type string `names coming from here <https://docs.mongodb.com/manual/reference/operator/query/type/>`_)
   - ``algo`` is either ``rand`` or ``det`` for random or deterministic encryption
   - ``method`` is either ``auto``, for automatic encryption or ``explicit`` for  explicit encryption
   - ``identifier`` is either ``id`` or ``altname`` for the key identifier
   - ``allowed`` is a boolean indicating whether the encryption for the given parameters is permitted.
   - ``value`` is the value to be tested.

   Create a new BSON document, named ``corpus_copied``.
   Iterate over each field of ``corpus``.

   - If the field name is ``_id``, ``altname_aws``, ``altname_local``, ``altname_azure``, or ``altname_gcp``, copy the field to ``corpus_copied``.
   - If ``method`` is ``auto``, copy the field to ``corpus_copied``.
   - If ``method`` is ``explicit``, use ``client_encryption`` to explicitly encrypt the value.

     - Encrypt with the algorithm described by ``algo``.
     - If ``identifier`` is ``id``

       - If ``kms`` is ``local`` set the key_id to the UUID with base64 value ``LOCALAAAAAAAAAAAAAAAAA==``.
       - If ``kms`` is ``aws`` set the key_id to the UUID with base64 value ``AWSAAAAAAAAAAAAAAAAAAA==``.
       - If ``kms`` is ``azure`` set the key_id to the UUID with base64 value ``AZUREAAAAAAAAAAAAAAAAA==``.
       - If ``kms`` is ``gcp`` set the key_id to the UUID with base64 value ``GCPAAAAAAAAAAAAAAAAAAA==``.

     - If ``identifier`` is ``altname``

       - If ``kms`` is ``local`` set the key_alt_name to "local".
       - If ``kms`` is ``aws`` set the key_alt_name to "aws".
       - If ``kms`` is ``azure`` set the key_alt_name to "azure".
       - If ``kms`` is ``gcp`` set the key_alt_name to "gcp".

     If ``allowed`` is true, copy the field and encrypted value to ``corpus_copied``.
     If ``allowed`` is false. verify that an exception is thrown. Copy the unencrypted value to to ``corpus_copied``.


6. Using ``client_encrypted``, insert ``corpus_copied`` into ``db.coll``.

7. Using ``client_encrypted``, find the inserted document from ``db.coll`` to a variable named ``corpus_decrypted``. Since it should have been automatically decrypted, assert the document exactly matches ``corpus``.

8. Load `corpus/corpus_encrypted.json <../corpus/corpus-encrypted.json>`_ to a variable named ``corpus_encrypted_expected``.
   Using ``client`` find the inserted document from ``db.coll`` to a variable named ``corpus_encrypted_actual``.

   Iterate over each field of ``corpus_encrypted_expected`` and check the following:

   - If the ``algo`` is ``det``, that the value equals the value of the corresponding field in ``corpus_encrypted_actual``.
   - If the ``algo`` is ``rand`` and ``allowed`` is true, that the value does not equal the value of the corresponding field in ``corpus_encrypted_actual``.
   - If ``allowed`` is true, decrypt the value with ``client_encryption``. Decrypt the value of the corresponding field of ``corpus_encrypted`` and validate that they are both equal.
   - If ``allowed`` is false, validate the value exactly equals the value of the corresponding field of ``corpus`` (neither was encrypted).

9. Repeat steps 1-8 with a local JSON schema. I.e. amend step 4 to configure the schema on ``client_encrypted`` with the ``schema_map`` option.

Custom Endpoint Test
~~~~~~~~~~~~~~~~~~~~

Setup
`````

For each test cases, start by creating two ``ClientEncryption`` objects. Recreate the ``ClientEncryption`` objects for each test case.

Create a ``ClientEncryption`` object (referred to as ``client_encryption``)

Configure with ``keyVaultNamespace`` set to ``keyvault.datakeys``, and a default MongoClient as the ``keyVaultClient``.

Configure with KMS providers as follows:

.. code:: javascript

   {
         "aws": {
            "accessKeyId": <set from environment>,
            "secretAccessKey": <set from environment>
         },
         "azure": {
            "tenantId": <set from environment>,
            "clientId": <set from environment>,
            "clientSecret": <set from environment>,
            "identityPlatformEndpoint": "login.microsoftonline.com:443"
         },
            "gcp": {
            "email": <set from environment>,
            "privateKey": <set from environment>,
            "endpoint": "oauth2.googleapis.com:443"
         }
   }

Create a ``ClientEncryption`` object (referred to as ``client_encryption_invalid``)

Configure with ``keyVaultNamespace`` set to ``keyvault.datakeys``, and a default MongoClient as the ``keyVaultClient``.

Configure with KMS providers as follows:

.. code:: javascript

   {
         "azure": {
            "tenantId": <set from environment>,
            "clientId": <set from environment>,
            "clientSecret": <set from environment>,
            "identityPlatformEndpoint": "example.com:443"
         },
            "gcp": {
            "email": <set from environment>,
            "privateKey": <set from environment>,
            "endpoint": "example.com:443"
         }
   }

Test cases
``````````

1. Call `client_encryption.createDataKey()` with "aws" as the provider and the following masterKey:

   .. code:: javascript

      {
        region: "us-east-1",
        key: "arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0"
      }

   Expect this to succeed. Use the returned UUID of the key to explicitly encrypt and decrypt the string "test" to validate it works.

2. Call `client_encryption.createDataKey()` with "aws" as the provider and the following masterKey:

   .. code:: javascript

      {
        region: "us-east-1",
        key: "arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0",
        endpoint: "kms.us-east-1.amazonaws.com"
      }

   Expect this to succeed. Use the returned UUID of the key to explicitly encrypt and decrypt the string "test" to validate it works.

3. Call `client_encryption.createDataKey()` with "aws" as the provider and the following masterKey:

   .. code:: javascript

      {
        region: "us-east-1",
        key: "arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0",
        endpoint: "kms.us-east-1.amazonaws.com:443"
      }

   Expect this to succeed. Use the returned UUID of the key to explicitly encrypt and decrypt the string "test" to validate it works.

4. Call `client_encryption.createDataKey()` with "aws" as the provider and the following masterKey:

   .. code:: javascript

      {
        region: "us-east-1",
        key: "arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0",
        endpoint: "kms.us-east-1.amazonaws.com:12345"
      }

   Expect this to fail with a socket connection error.

5. Call `client_encryption.createDataKey()` with "aws" as the provider and the following masterKey:

   .. code:: javascript

      {
        region: "us-east-1",
        key: "arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0",
        endpoint: "kms.us-east-2.amazonaws.com"
      }

   Expect this to fail with an exception with a message containing the string: "us-east-1"

6. Call `client_encryption.createDataKey()` with "aws" as the provider and the following masterKey:

   .. code:: javascript

      {
        region: "us-east-1",
        key: "arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0",
        endpoint: "example.com"
      }

   Expect this to fail with an exception with a message containing the string: "parse error"

7. Call `client_encryption.createDataKey()` with "azure" as the provider and the following masterKey:

   .. code:: javascript

      {
         "keyVaultEndpoint": "key-vault-csfle.vault.azure.net",
         "keyName": "key-name-csfle"
      }

   Expect this to succeed. Use the returned UUID of the key to explicitly encrypt and decrypt the string "test" to validate it works.

   Call ``client_encryption_invalid.createDataKey()`` with the same masterKey. Expect this to fail with an exception with a message containing the string: "parse error".

8. Call `client_encryption.createDataKey()` with "gcp" as the provider and the following masterKey:

   .. code:: javascript

      {
        "projectId": "devprod-drivers",
        "location": "global",
        "keyRing": "key-ring-csfle",
        "keyName": "key-name-csfle",
        "endpoint": "cloudkms.googleapis.com:443"
      }

   Expect this to succeed. Use the returned UUID of the key to explicitly encrypt and decrypt the string "test" to validate it works.

   Call ``client_encryption_invalid.createDataKey()`` with the same masterKey. Expect this to fail with an exception with a message containing the string: "parse error".

9. Call `client_encryption.createDataKey()` with "gcp" as the provider and the following masterKey:

   .. code:: javascript

      {
        "projectId": "devprod-drivers",
        "location": "global",
        "keyRing": "key-ring-csfle",
        "keyName": "key-name-csfle",
        "endpoint": "example.com:443"
      }

   Expect this to fail with an exception with a message containing the string: "Invalid KMS response".

Bypass spawning mongocryptd
~~~~~~~~~~~~~~~~~~~~~~~~~~~

Via mongocryptdBypassSpawn
``````````````````````````

The following tests that setting ``mongocryptdBypassSpawn=true`` really does bypass spawning mongocryptd.

#. Create a MongoClient configured with auto encryption (referred to as ``client_encrypted``)

   Configure the required options. Use the ``local`` KMS provider as follows:

   .. code:: javascript

      { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } }

   Configure with the ``keyVaultNamespace`` set to ``keyvault.datakeys``.

   Configure ``client_encrypted`` to use the schema `external/external-schema.json <../external/external-schema.json>`_  for ``db.coll`` by setting a schema map like: ``{ "db.coll": <contents of external-schema.json>}``

   Configure the following ``extraOptions``:

   .. code:: javascript

      {
        "mongocryptdBypassSpawn": true
        "mongocryptdURI": "mongodb://localhost:27021/db?serverSelectionTimeoutMS=1000",
        "mongocryptdSpawnArgs": [ "--pidfilepath=bypass-spawning-mongocryptd.pid", "--port=27021"]
      }

   Drivers MAY pass a different port if they expect their testing infrastructure to be using port 27021. Pass a port that should be free.

#. Use ``client_encrypted`` to insert the document ``{"encrypted": "test"}`` into ``db.coll``. Expect a server selection error propagated from the internal MongoClient failing to connect to mongocryptd on port 27021.

Via bypassAutoEncryption
````````````````````````

The following tests that setting ``bypassAutoEncryption=true`` really does bypass spawning mongocryptd.

#. Create a MongoClient configured with auto encryption (referred to as ``client_encrypted``)

   Configure the required options. Use the ``local`` KMS provider as follows:

   .. code:: javascript

      { "local": { "key": <base64 decoding of LOCAL_MASTERKEY> } }

   Configure with the ``keyVaultNamespace`` set to ``keyvault.datakeys``.

   Configure with ``bypassAutoEncryption=true``.

   Configure the following ``extraOptions``:

   .. code:: javascript

      {
        "mongocryptdSpawnArgs": [ "--pidfilepath=bypass-spawning-mongocryptd.pid", "--port=27021"]
      }

   Drivers MAY pass a different value to ``--port`` if they expect their testing infrastructure to be using port 27021. Pass a port that should be free.

#. Use ``client_encrypted`` to insert the document ``{"unencrypted": "test"}`` into ``db.coll``. Expect this to succeed. 

#. Validate that mongocryptd was not spawned. Create a MongoClient to localhost:27021 (or whatever was passed via ``--port``) with serverSelectionTimeoutMS=1000. Run an ``isMaster`` command and ensure it fails with a server selection timeout.