// The corpus test exhaustively enumerates all ways to encrypt all BSON value types. Note, the test data includes BSON binary subtype 4 (or standard UUID), which MUST be decoded and encoded as subtype 4. Run the test as follows.

import { EJSON } from 'bson';
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { ClientEncryption } from '../../../src/client-side-encryption/client_encryption';
import { type MongoClient, WriteConcern } from '../../mongodb';
import { getEncryptExtraOptions } from '../../tools/utils';

describe('Client Side Encryption Prose Corpus Test', function () {
  const metadata = {
    requires: {
      mongodb: '>=4.2.0',
      clientSideEncryption: true as const
    }
  };

  const corpusDir = path.resolve(__dirname, '../../spec/client-side-encryption/corpus');
  function loadCorpusData(filename) {
    return EJSON.parse(fs.readFileSync(path.resolve(corpusDir, filename), { encoding: 'utf8' }), {
      relaxed: false
    });
  }

  const CSFLE_KMS_PROVIDERS = process.env.CSFLE_KMS_PROVIDERS;
  const kmsProviders = CSFLE_KMS_PROVIDERS ? EJSON.parse(CSFLE_KMS_PROVIDERS) : {};
  kmsProviders.local = {
    key: Buffer.from(
      'Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk',
      'base64'
    )
  };
  kmsProviders.kmip = {
    endpoint: 'localhost:5698'
  };

  // TODO: build this into EJSON
  // TODO: make a custom chai assertion for this
  function toComparableExtendedJSON(value) {
    return JSON.parse(EJSON.stringify({ value }, { relaxed: false }));
  }

  // Filters out tests that have to do with dbPointer
  // TODO: fix dbpointer and get rid of this.
  function filterImportedObject(object) {
    return Object.keys(object).reduce((copy, key) => {
      const value = object[key];

      if (value && typeof value === 'object' && value.type === 'dbPointer') {
        return copy;
      }

      copy[key] = value;
      return copy;
    }, {});
  }

  const corpusSchema = loadCorpusData('corpus-schema.json');
  const corpusKeyLocal = loadCorpusData('corpus-key-local.json');
  const corpusKeyAws = loadCorpusData('corpus-key-aws.json');
  const corpusKeyAzure = loadCorpusData('corpus-key-azure.json');
  const corpusKeyKmip = loadCorpusData('corpus-key-kmip.json');
  const corpusKeyGcp = loadCorpusData('corpus-key-gcp.json');
  const corpusAll = filterImportedObject(loadCorpusData('corpus.json'));
  const corpusEncryptedExpectedAll = filterImportedObject(loadCorpusData('corpus-encrypted.json'));

  const dataDbName = 'db';
  const dataCollName = 'coll';
  const dataNamespace = `${dataDbName}.${dataCollName}`;
  const keyVaultDbName = 'keyvault';
  const keyVaultCollName = 'datakeys';
  const keyVaultNamespace = `${keyVaultDbName}.${keyVaultCollName}`;

  const algorithmMap = new Map([
    ['rand', 'AEAD_AES_256_CBC_HMAC_SHA_512-Random'],
    ['det', 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic']
  ]);
  const identifierMap = new Map([
    ['local', corpusKeyLocal._id],
    ['aws', corpusKeyAws._id],
    ['azure', corpusKeyAzure._id],
    ['gcp', corpusKeyGcp._id],
    ['kmip', corpusKeyKmip._id]
  ]);
  const keyAltNameMap = new Map([
    ['local', 'local'],
    ['aws', 'aws'],
    ['azure', 'azure'],
    ['gcp', 'gcp'],
    ['kmip', 'kmip']
  ]);
  const copyOverValues = new Set([
    '_id',
    'altname_aws',
    'altname_local',
    'altname_azure',
    'altname_gcp',
    'altname_kmip'
  ]);

  async function assertion(clientEncryption, _key, expected, actual) {
    if (typeof expected === 'string') {
      expect(actual).to.equal(expected);
      return;
    }

    const expectedValue = expected.value;
    const actualValue = actual.value;
    const expectedJSON = toComparableExtendedJSON(expectedValue);
    const actualJSON = toComparableExtendedJSON(actualValue);

    switch (expected.algo) {
      case 'det': {
        expect(actualJSON).to.deep.equal(expectedJSON);
        break;
      }
      case 'rand': {
        if (expected.allowed === true) {
          expect(actualJSON).to.not.deep.equal(expectedJSON);
        }
        break;
      }
      default: {
        throw new Error('Unexpected algorithm: ' + expected.algo);
      }
    }

    if (expected.allowed === true) {
      const [decryptedExpectedValue, decryptedActualValue] = await Promise.all([
        clientEncryption.decrypt(expectedValue),
        clientEncryption.decrypt(actualValue)
      ]);

      const decryptedExpectedJSON = toComparableExtendedJSON(decryptedExpectedValue);
      const decryptedActualJSON = toComparableExtendedJSON(decryptedActualValue);

      expect(decryptedActualJSON).to.deep.equal(decryptedExpectedJSON);
    } else if (expected.allowed === false) {
      expect(actualJSON).to.deep.equal(expectedJSON);
    } else {
      throw new Error('Unexpected value for allowed: ' + expected.allowed);
    }
  }

  let client: MongoClient;

  beforeEach(async function () {
    // 1. Create a MongoClient without encryption enabled (referred to as ``client``).
    client = this.configuration.newClient();

    await client.connect();
    // 3. Using ``client``, drop the collection ``keyvault.datakeys``. Insert the documents `corpus/corpus-key-local.json <../corpus/corpus-key-local.json>`_ and `corpus/corpus-key-aws.json <../corpus/corpus-key-aws.json>`_.
    const keyDb = client.db(keyVaultDbName);
    await keyDb
      .dropCollection(keyVaultCollName, { writeConcern: new WriteConcern('majority') })
      .catch((e: Error) => {
        if (!/ns/i.test(e.message)) {
          throw e;
        }
      });
    const keyColl = keyDb.collection(keyVaultCollName);
    await keyColl.insertMany(
      [corpusKeyLocal, corpusKeyAws, corpusKeyAzure, corpusKeyGcp, corpusKeyKmip],
      { writeConcern: new WriteConcern('majority') }
    );
  });

  afterEach(() => client?.close());

  function defineCorpusTests(corpus, corpusEncryptedExpected, useClientSideSchema: boolean) {
    let clientEncrypted: MongoClient, clientEncryption: ClientEncryption;
    beforeEach(async function () {
      // 2. Using ``client``, drop and create the collection ``db.coll`` configured with the included JSON schema `corpus/corpus-schema.json <../corpus/corpus-schema.json>`_.
      const dataDb = client.db(dataDbName);
      await dataDb
        .dropCollection(dataCollName, { writeConcern: new WriteConcern('majority') })
        .catch((e: Error) => {
          if (!/ns/i.test(e.message)) {
            throw e;
          }
        });
      await dataDb.createCollection(dataCollName, {
        validator: { $jsonSchema: corpusSchema },
        writeConcern: new WriteConcern('majority')
      });
      // 4. Create the following:
      //    - A MongoClient configured with auto encryption (referred to as ``client_encrypted``)
      //    - A ``ClientEncryption`` object (referred to as ``client_encryption``)
      //    Configure both objects with ``aws`` and the ``local`` KMS providers as follows:
      //    .. code:: javascript
      //       {
      //           "aws": { <AWS credentials> },
      //           "local": { "key": <base64 decoding of LOCAL_MASTERKEY> }
      //       }
      //    Where LOCAL_MASTERKEY is the following base64:
      //    .. code:: javascript
      //       Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk
      //    Configure both objects with ``keyVaultNamespace`` set to ``keyvault.datakeys``.
      const tlsOptions = {
        kmip: {
          tlsCAFile: process.env.KMIP_TLS_CA_FILE,
          tlsCertificateKeyFile: process.env.KMIP_TLS_CERT_FILE
        }
      };
      const extraOptions = getEncryptExtraOptions();
      const autoEncryption = {
        keyVaultNamespace,
        kmsProviders,
        tlsOptions,
        extraOptions
      };
      if (useClientSideSchema) {
        autoEncryption.schemaMap = {
          [dataNamespace]: corpusSchema
        };
      }
      clientEncrypted = this.configuration.newClient({}, { autoEncryption });

      await clientEncrypted.connect();
      clientEncryption = new ClientEncryption(client, {
        keyVaultNamespace,
        kmsProviders,
        tlsOptions
      });
    });

    afterEach(() => clientEncrypted.close());

    it(
      `should pass corpus ${useClientSideSchema ? 'with' : 'without'} client schema`,
      metadata,
      async function () {
        const corpusCopied = {};

        // 5. Load `corpus/corpus.json <../corpus/corpus.json>`_ to a variable named ``corpus``. The corpus contains subdocuments with the following fields:
        //
        //    - ``kms`` is either ``aws`` or ``local``
        //    - ``type`` is a BSON type string `names coming from here <https://www.mongodb.com/docs/manual/reference/operator/query/type/>`_)
        //    - ``algo`` is either ``rand`` or ``det`` for random or deterministic encryption
        //    - ``method`` is either ``auto``, for automatic encryption or ``explicit`` for  explicit encryption
        //    - ``identifier`` is either ``id`` or ``altname`` for the key identifier
        //    - ``allowed`` is a boolean indicating whether the encryption for the given parameters is permitted.
        //    - ``value`` is the value to be tested.
        //
        //    Create a new BSON document, named ``corpus_copied``.
        //
        //    Iterate over each field of ``corpus``.
        //    - If the field name is ``_id``, ``altname_aws`` and ``altname_local``, copy the field to ``corpus_copied``.
        //    - If ``method`` is ``auto``, copy the field to ``corpus_copied``.
        //    - If ``method`` is ``explicit``, use ``client_encryption`` to explicitly encrypt the value.
        //      - Encrypt with the algorithm described by ``algo``.
        //      - If ``identifier`` is ``id``
        //        - If ``kms`` is ``local`` set the key_id to the UUID with base64 value ``LOCALAAAAAAAAAAAAAAAAA==``.
        //        - If ``kms`` is ``aws`` set the key_id to the UUID with base64 value ``AWSAAAAAAAAAAAAAAAAAAA==``.
        //      - If ``identifier`` is ``altname``
        //        - If ``kms`` is ``local`` set the key_alt_name to "local".
        //        - If ``kms`` is ``aws`` set the key_alt_name to "aws".
        //      If ``allowed`` is true, copy the field and encrypted value to ``corpus_copied``.
        //      If ``allowed`` is false. verify that an exception is thrown. Copy the unencrypted value to to ``corpus_copied``.
        for (const key of Object.keys(corpus)) {
          const field = corpus[key];
          if (copyOverValues.has(key)) {
            corpusCopied[key] = field;
            continue;
          }
          if (field.method === 'auto') {
            corpusCopied[key] = Object.assign({}, field);
            continue;
          }
          if (field.method === 'explicit') {
            const encryptOptions = {
              algorithm: algorithmMap.get(field.algo)
            };
            if (field.identifier === 'id') {
              encryptOptions.keyId = identifierMap.get(field.kms);
            } else if (field.identifier === 'altname') {
              encryptOptions.keyAltName = keyAltNameMap.get(field.kms);
            } else {
              throw new Error('Unexpected identifier: ' + field.identifier);
            }

            try {
              const encryptedValue = await clientEncryption.encrypt(field.value, encryptOptions);
              if (field.allowed === true) {
                corpusCopied[key] = Object.assign({}, field, { value: encryptedValue });
              } else {
                throw new Error(
                  `Expected encryption to fail for case ${key} on value ${field.value}`
                );
              }
            } catch (error) {
              if (field.allowed === false) {
                corpusCopied[key] = Object.assign({}, field);
              } else {
                throw error;
              }
            }
          } else {
            throw new Error('Unexpected method: ' + field.method);
          }
        }

        // 6. Using ``client_encrypted``, insert ``corpus_copied`` into ``db.coll``.
        await clientEncrypted
          .db(dataDbName)
          .collection(dataCollName)
          .insertOne(corpusCopied, {
            writeConcern: new WriteConcern('majority')
          });
        // 7. Using ``client_encrypted``, find the inserted document from ``db.coll`` to a variable named ``corpus_decrypted``.
        // Since it should have been automatically decrypted, assert the document exactly matches ``corpus``.
        const corpusDecrypted = await clientEncrypted
          .db(dataDbName)
          .collection(dataCollName)
          .findOne({ _id: corpusCopied._id }, { promoteLongs: false, promoteValues: false });
        expect(toComparableExtendedJSON(corpusDecrypted)).to.deep.equal(
          toComparableExtendedJSON(corpus)
        );

        // 8. Load `corpus/corpus_encrypted.json <../corpus/corpus-encrypted.json>`_ to a variable named ``corpus_encrypted_expected``.
        //    Using ``client`` find the inserted document from ``db.coll`` to a variable named ``corpus_encrypted_actual``.

        //    Iterate over each field of ``corpus_encrypted_expected`` and check the following:

        //    - If the ``algo`` is ``det``, that the value equals the value of the corresponding field in ``corpus_encrypted_actual``.
        //    - If the ``algo`` is ``rand`` and ``allowed`` is true, that the value does not equal the value of the corresponding field in ``corpus_encrypted_actual``.
        //    - If ``allowed`` is true, decrypt the value with ``client_encryption``. Decrypt the value of the corresponding field of ``corpus_encrypted`` and validate that they are both equal.
        //    - If ``allowed`` is false, validate the value exactly equals the value of the corresponding field of ``corpus`` (neither was encrypted).
        const corpusEncryptedActual = await client
          .db(dataDbName)
          .collection(dataCollName)
          .findOne({ _id: corpusCopied._id }, { promoteLongs: false, promoteValues: false });
        for (const key of Object.keys(corpusEncryptedExpected)) {
          await assertion(
            clientEncryption,
            key,
            corpusEncryptedExpected[key],
            corpusEncryptedActual[key]
          );
        }
      }
    );
  }
  // Note: You can uncomment the block below to run the corpus for each individial item
  // instead of running the entire corpus at once. It is significantly slower,
  // but gives you higher visibility into why the corpus may be failing

  // function pickValues(obj, key) {
  //   return {
  //     _id: obj._id,
  //     altname_aws: obj.altname_aws,
  //     altname_local: obj.altname_local,
  //     [key]: obj[key]
  //   };
  // }
  // Object.keys(corpusAll)
  //   .filter(x => !copyOverValues.has(x))
  //   .forEach(key => {
  //     const corpus = pickValues(corpusAll, key);
  //     const corpusExpectedEncrypted = pickValues(corpusEncryptedExpectedAll, key);

  //     describe(key, function() {
  //       defineCorpusTests(corpus, corpusExpectedEncrypted);
  //       defineCorpusTests(corpus, corpusExpectedEncrypted, true);
  //     });
  //   });

  defineCorpusTests(corpusAll, corpusEncryptedExpectedAll, false);

  // 9. Repeat steps 1-8 with a local JSON schema. I.e. amend step 4 to configure the schema on ``client_encrypted`` with the ``schema_map`` option.
  defineCorpusTests(corpusAll, corpusEncryptedExpectedAll, true);
});
