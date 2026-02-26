import { expect } from 'chai';

import { getCSFLEKMSProviders } from '../../csfle-kms-providers';
import { type Binary, ClientEncryption, Int32, Long } from '../../mongodb';
const metaData: MongoDBMetadataUI = {
  requires: {
    clientSideEncryption: '>=6.1.0',

    // The Range Explicit Encryption tests require MongoDB server 7.0+ for QE v2.
    // The tests must not run against a standalone.
    //
    // `range` is not supported on 8.0+ servers.
    mongodb: '>=8.0.0',
    topology: '!single'
  }
};

const getKmsProviders = (): { local: { key: Buffer } } => {
  const result = getCSFLEKMSProviders();

  return { local: result.local };
};

describe('Range Explicit Encryption Defaults', function () {
  let clientEncryption: ClientEncryption;
  let keyId;
  let keyVaultClient;
  let payload_defaults: Binary;

  beforeEach(async function () {
    // Create a MongoClient named `keyVaultClient`.
    keyVaultClient = this.configuration.newClient();

    // Create a ClientEncryption object named `clientEncryption` with these options:
    // ```typescript
    // class ClientEncryptionOpts {
    //   keyVaultClient: keyVaultClient,
    //   keyVaultNamespace: "keyvault.datakeys",
    //   kmsProviders: { "local": { "key": "<base64 decoding of LOCAL_MASTERKEY>" } },
    // }
    // ```
    clientEncryption = new ClientEncryption(keyVaultClient, {
      keyVaultNamespace: 'keyvault.datakeys',
      kmsProviders: getKmsProviders()
    });

    // Create a key with `clientEncryption.createDataKey`. Store the returned key ID in a variable named `keyId`.
    keyId = await clientEncryption.createDataKey('local');

    // Call `clientEncryption.encrypt` to encrypt the int32 value `123` with these options:
    // ```typescript
    // class EncryptOpts {
    //   keyId : keyId,
    //   algorithm: "Range",
    //   contentionFactor: 0,
    //   rangeOpts: RangeOpts {
    //       min: 0,
    //       max: 1000
    //   }
    // }
    // ```
    // Store the result in a variable named `payload_defaults`.
    payload_defaults = await clientEncryption.encrypt(new Int32(123), {
      keyId,
      algorithm: 'Range',
      contentionFactor: 0,
      rangeOptions: {
        min: 0,
        max: 1000
      }
    });
  });

  afterEach(async function () {
    await keyVaultClient.close();
  });

  it('Case 1: Uses libmongocrypt defaults', metaData, async function () {
    // Call `clientEncryption.encrypt` to encrypt the int32 value `123` with these options:
    // ```typescript
    // class EncryptOpts {
    //   keyId : keyId,
    //   algorithm: "Range",
    //   contentionFactor: 0,
    //   rangeOpts: RangeOpts {
    //       min: 0,
    //       max: 1000,
    //       sparsity: 2,
    //       trimFactor: 6
    //   }
    // }
    // ```
    const encrypted = await clientEncryption.encrypt(new Int32(123), {
      keyId: keyId,
      algorithm: 'Range',
      contentionFactor: 0,
      rangeOptions: {
        min: 0,
        max: 1000,
        sparsity: new Long(2),
        trimFactor: new Int32(6)
      }
    });

    // Assert the returned payload size equals the size of `payload_defaults`.
    expect(encrypted.length()).to.equal(payload_defaults.length());
  });

  it('Case 2: can find encrypted range and return the maximum', metaData, async function () {
    // Call `clientEncryption.encrypt` to encrypt the int32 value `123` with these options:
    // ```typescript
    // class EncryptOpts {
    //   keyId : keyId,
    //   algorithm: "Range",
    //   contentionFactor: 0,
    //   rangeOpts: RangeOpts {
    //       min: 0,
    //       max: 1000,
    //       trimFactor: 0
    //   }
    // }
    // ```
    const encrypted = await clientEncryption.encrypt(new Int32(123), {
      keyId: keyId,
      algorithm: 'Range',
      contentionFactor: 0,
      rangeOptions: {
        min: 0,
        max: 1000,
        trimFactor: new Int32(0)
      }
    });

    // Assert the returned payload size is greater than the size of `payload_defaults`.
    expect(encrypted.length()).to.be.greaterThan(payload_defaults.length());
  });
});
