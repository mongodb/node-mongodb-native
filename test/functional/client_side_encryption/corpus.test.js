'use strict';

// The corpus test exhaustively enumerates all ways to encrypt all BSON value types. Note, the test data includes BSON binary subtype 4 (or standard UUID), which MUST be decoded and encoded as subtype 4. Run the test as follows.

const fs = require('fs');
const path = require('path');
const EJSON = require('mongodb-extjson');
const chai = require('chai');
const expect = chai.expect;
chai.config.includeStack = true;
chai.config.showDiff = true;
chai.config.truncateThreshold = 0;

describe('Client Side Encryption Corpus', function() {
  const metadata = {
    requires: {
      mongodb: '>=4.2.0',
      clientSideEncryption: true
    }
  };

  const corpusDir = path.resolve(__dirname, '../../spec/client-side-encryption/corpus');
  function loadCorpusData(filename) {
    return EJSON.parse(fs.readFileSync(path.resolve(corpusDir, filename), { strict: true }));
  }

  const CSFLE_KMS_PROVIDERS = process.env.CSFLE_KMS_PROVIDERS;
  const kmsProviders = CSFLE_KMS_PROVIDERS ? EJSON.parse(CSFLE_KMS_PROVIDERS) : {};
  kmsProviders.local = {
    key: Buffer.from(
      'Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk',
      'base64'
    )
  };

  // TODO: build this into EJSON
  // TODO: make a custom chai assertion for this
  function toComparableExtendedJSON(value) {
    return JSON.parse(EJSON.stringify({ value }, { strict: true }));
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
    ['gcp', corpusKeyGcp._id]
  ]);
  const keyAltNameMap = new Map([
    ['local', 'local'],
    ['aws', 'aws'],
    ['azure', 'azure'],
    ['gcp', 'gcp']
  ]);
  const copyOverValues = new Set([
    '_id',
    'altname_aws',
    'altname_local',
    'altname_azure',
    'altname_gcp'
  ]);

  let client;

  function assertion(clientEncryption, key, expected, actual) {
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
      return Promise.all([
        clientEncryption.decrypt(expectedValue),
        clientEncryption.decrypt(actualValue)
      ]).then(results => {
        const decryptedExpectedValue = results[0];
        const decryptedActualValue = results[1];

        const decryptedExpectedJSON = toComparableExtendedJSON(decryptedExpectedValue);
        const decryptedActualJSON = toComparableExtendedJSON(decryptedActualValue);

        expect(decryptedActualJSON).to.deep.equal(decryptedExpectedJSON);
      });
    } else if (expected.allowed === false) {
      expect(actualJSON).to.deep.equal(expectedJSON);
    } else {
      throw new Error('Unexpected value for allowed: ' + expected.allowed);
    }
  }

  before(function() {
    // 1. Create a MongoClient without encryption enabled (referred to as ``client``).
    client = this.configuration.newClient({
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    return Promise.resolve()
      .then(() => client.connect())
      .then(() => {
        // 3. Using ``client``, drop the collection ``keyvault.datakeys``. Insert the documents `corpus/corpus-key-local.json <../corpus/corpus-key-local.json>`_ and `corpus/corpus-key-aws.json <../corpus/corpus-key-aws.json>`_.
        const keyDb = client.db(keyVaultDbName);
        return Promise.resolve()
          .then(() => keyDb.dropCollection(keyVaultCollName))
          .catch(() => {})
          .then(() => keyDb.collection(keyVaultCollName))
          .then(keyColl =>
            keyColl.insertMany([corpusKeyLocal, corpusKeyAws, corpusKeyAzure, corpusKeyGcp])
          );
      });
  });

  after(function() {
    if (client) {
      return client.close();
    }
  });

  function defineCorpusTests(corpus, corpusEncryptedExpected, useClientSideSchema) {
    let clientEncrypted, clientEncryption;
    beforeEach(function() {
      const mongodbClientEncryption = this.configuration.mongodbClientEncryption;
      return Promise.resolve()
        .then(() => {
          // 2. Using ``client``, drop and create the collection ``db.coll`` configured with the included JSON schema `corpus/corpus-schema.json <../corpus/corpus-schema.json>`_.
          const dataDb = client.db(dataDbName);
          return Promise.resolve()
            .then(() => dataDb.dropCollection(dataCollName))
            .catch(() => {})
            .then(() =>
              dataDb.createCollection(dataCollName, {
                validator: { $jsonSchema: corpusSchema }
              })
            );
        })
        .then(() => {
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
          const autoEncryption = {
            keyVaultNamespace,
            kmsProviders
          };
          if (useClientSideSchema) {
            autoEncryption.schemaMap = {
              [dataNamespace]: corpusSchema
            };
          }
          clientEncrypted = this.configuration.newClient(
            {},
            {
              useNewUrlParser: true,
              useUnifiedTopology: true,
              autoEncryption
            }
          );

          return clientEncrypted.connect().then(() => {
            clientEncryption = new mongodbClientEncryption.ClientEncryption(client, {
              keyVaultNamespace,
              kmsProviders
            });
          });
        });
    });

    afterEach(() => clientEncrypted.close());

    function forEachP(list, fn) {
      return list.reduce((p, item) => {
        return p.then(() => fn(item));
      }, Promise.resolve());
    }

    it(
      `should pass corpus ${useClientSideSchema ? 'with' : 'without'} client schema`,
      metadata,
      function() {
        const corpusCopied = {};
        return Promise.resolve()
          .then(() => {
            // 5. Load `corpus/corpus.json <../corpus/corpus.json>`_ to a variable named ``corpus``. The corpus contains subdocuments with the following fields:
            //
            //    - ``kms`` is either ``aws`` or ``local``
            //    - ``type`` is a BSON type string `names coming from here <https://docs.mongodb.com/manual/reference/operator/query/type/>`_)
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
            return forEachP(Object.keys(corpus), key => {
              const field = corpus[key];
              if (copyOverValues.has(key)) {
                corpusCopied[key] = field;
                return;
              }
              if (field.method === 'auto') {
                corpusCopied[key] = Object.assign({}, field);
                return;
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

                return Promise.resolve()
                  .then(() => clientEncryption.encrypt(field.value, encryptOptions))
                  .then(
                    encryptedValue => {
                      if (field.allowed === true) {
                        corpusCopied[key] = Object.assign({}, field, { value: encryptedValue });
                      } else {
                        throw new Error(
                          `Expected encryption to fail for case ${key} on value ${field.value}`
                        );
                      }
                    },
                    e => {
                      if (field.allowed === false) {
                        corpusCopied[key] = Object.assign({}, field);
                      } else {
                        throw e;
                      }
                    }
                  );
              }

              throw new Error('Unexpected method: ' + field.method);
            });
          })
          .then(() => {
            // 6. Using ``client_encrypted``, insert ``corpus_copied`` into ``db.coll``.
            return clientEncrypted
              .db(dataDbName)
              .collection(dataCollName)
              .insertOne(corpusCopied);
          })
          .then(() => {
            // 7. Using ``client_encrypted``, find the inserted document from ``db.coll`` to a variable named ``corpus_decrypted``.
            // Since it should have been automatically decrypted, assert the document exactly matches ``corpus``.
            return clientEncrypted
              .db(dataDbName)
              .collection(dataCollName)
              .findOne({ _id: corpusCopied._id }, { promoteLongs: false, promoteValues: false });
          })
          .then(corpusDecrypted => {
            expect(toComparableExtendedJSON(corpusDecrypted)).to.deep.equal(
              toComparableExtendedJSON(corpus)
            );
          })
          .then(() => {
            // 8. Load `corpus/corpus_encrypted.json <../corpus/corpus-encrypted.json>`_ to a variable named ``corpus_encrypted_expected``.
            //    Using ``client`` find the inserted document from ``db.coll`` to a variable named ``corpus_encrypted_actual``.

            //    Iterate over each field of ``corpus_encrypted_expected`` and check the following:

            //    - If the ``algo`` is ``det``, that the value equals the value of the corresponding field in ``corpus_encrypted_actual``.
            //    - If the ``algo`` is ``rand`` and ``allowed`` is true, that the value does not equal the value of the corresponding field in ``corpus_encrypted_actual``.
            //    - If ``allowed`` is true, decrypt the value with ``client_encryption``. Decrypt the value of the corresponding field of ``corpus_encrypted`` and validate that they are both equal.
            //    - If ``allowed`` is false, validate the value exactly equals the value of the corresponding field of ``corpus`` (neither was encrypted).
            return client
              .db(dataDbName)
              .collection(dataCollName)
              .findOne({ _id: corpusCopied._id }, { promoteLongs: false, promoteValues: false });
          })
          .then(corpusEncryptedActual => {
            return forEachP(Object.keys(corpusEncryptedExpected), key => {
              return assertion(
                clientEncryption,
                key,
                corpusEncryptedExpected[key],
                corpusEncryptedActual[key]
              );
            });
          });
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

  defineCorpusTests(corpusAll, corpusEncryptedExpectedAll);

  // 9. Repeat steps 1-8 with a local JSON schema. I.e. amend step 4 to configure the schema on ``client_encrypted`` with the ``schema_map`` option.
  defineCorpusTests(corpusAll, corpusEncryptedExpectedAll, true);
});
