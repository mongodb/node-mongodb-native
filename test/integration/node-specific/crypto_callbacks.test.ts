import { expect } from 'chai';
import * as sinon from 'sinon';

/* eslint-disable @typescript-eslint/no-restricted-imports */
import { ClientEncryption } from '../../../src/client-side-encryption/client_encryption';
/* eslint-disable @typescript-eslint/no-restricted-imports */
import * as cryptoCallbacks from '../../../src/client-side-encryption/crypto_callbacks';
import { type MongoClient } from '../../mongodb';
// Data Key Stuff
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION;
const AWS_CMK_ID = process.env.AWS_CMK_ID;
const kmsProviders = {
  aws: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY }
};
const dataKeyOptions = { masterKey: { key: AWS_CMK_ID, region: AWS_REGION } };
const SKIP_AWS_TESTS = [AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_CMK_ID].some(
  secret => !secret
);
describe('cryptoCallbacks', function () {
  let client: MongoClient;
  let sandbox;
  const hookNames = new Set([
    'aes256CbcEncryptHook',
    'aes256CbcDecryptHook',
    'randomHook',
    'hmacSha512Hook',
    'hmacSha256Hook',
    'sha256Hook'
  ]);

  beforeEach(function () {
    if (SKIP_AWS_TESTS) {
      this.currentTest?.skip();
      return;
    }
    sandbox = sinon.createSandbox();
    sandbox.spy(cryptoCallbacks);
    client = this.configuration.newClient();
    return client.connect();
  });

  afterEach(async function () {
    sandbox?.restore();
    await client?.close();
  });

  it('should support support crypto callback for signing RSA-SHA256', function () {
    const input = Buffer.from('data to sign');
    const pemFileData =
      'MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC4JOyv5z05cL18ztpknRC7CFY2gYol4DAKerdVUoDJxCTmFMf39dVUEqD0WDiw/qcRtSO1/FRut08PlSPmvbyKetsLoxlpS8lukSzEFpFK7+L+R4miFOl6HvECyg7lbC1H/WGAhIz9yZRlXhRo9qmO/fB6PV9IeYtU+1xYuXicjCDPp36uuxBAnCz7JfvxJ3mdVc0vpSkbSb141nWuKNYR1mgyvvL6KzxO6mYsCo4hRAdhuizD9C4jDHk0V2gDCFBk0h8SLEdzStX8L0jG90/Og4y7J1b/cPo/kbYokkYisxe8cPlsvGBf+rZex7XPxc1yWaP080qeABJb+S88O//LAgMBAAECggEBAKVxP1m3FzHBUe2NZ3fYCc0Qa2zjK7xl1KPFp2u4CU+9sy0oZJUqQHUdm5CMprqWwIHPTftWboFenmCwrSXFOFzujljBO7Z3yc1WD3NJl1ZNepLcsRJ3WWFH5V+NLJ8Bdxlj1DMEZCwr7PC5+vpnCuYWzvT0qOPTl9RNVaW9VVjHouJ9Fg+s2DrShXDegFabl1iZEDdI4xScHoYBob06A5lw0WOCTayzw0Naf37lM8Y4psRAmI46XLiF/Vbuorna4hcChxDePlNLEfMipICcuxTcei1RBSlBa2t1tcnvoTy6cuYDqqImRYjp1KnMKlKQBnQ1NjS2TsRGm+F0FbreVCECgYEA4IDJlm8q/hVyNcPe4OzIcL1rsdYN3bNm2Y2O/YtRPIkQ446ItyxD06d9VuXsQpFp9jNACAPfCMSyHpPApqlxdc8z/xATlgHkcGezEOd1r4E7NdTpGg8y6Rj9b8kVlED6v4grbRhKcU6moyKUQT3+1B6ENZTOKyxuyDEgTwZHtFECgYEA0fqdv9h9s77d6eWmIioP7FSymq93pC4umxf6TVicpjpMErdD2ZfJGulN37dq8FOsOFnSmFYJdICj/PbJm6p1i8O21lsFCltEqVoVabJ7/0alPfdG2U76OeBqI8ZubL4BMnWXAB/VVEYbyWCNpQSDTjHQYs54qa2I0dJB7OgJt1sCgYEArctFQ02/7H5Rscl1yo3DBXO94SeiCFSPdC8f2Kt3MfOxvVdkAtkjkMACSbkoUsgbTVqTYSEOEc2jTgR3iQ13JgpHaFbbsq64V0QP3TAxbLIQUjYGVgQaF1UfLOBv8hrzgj45z/ST/G80lOl595+0nCUbmBcgG1AEWrmdF0/3RmECgYAKvIzKXXB3+19vcT2ga5Qq2l3TiPtOGsppRb2XrNs9qKdxIYvHmXo/9QP1V3SRW0XoD7ez8FpFabp42cmPOxUNk3FK3paQZABLxH5pzCWI9PzIAVfPDrm+sdnbgG7vAnwfL2IMMJSA3aDYGCbF9EgefG+STcpfqq7fQ6f5TBgLFwKBgCd7gn1xYL696SaKVSm7VngpXlczHVEpz3kStWR5gfzriPBxXgMVcWmcbajRser7ARpCEfbxM1UJyv6oAYZWVSNErNzNVb4POqLYcCNySuC6xKhs9FrEQnyKjyk8wI4VnrEMGrQ8e+qYSwYk9Gh6dKGoRMAPYVXQAO0fIsHF/T0a\n';
    const key = Buffer.from(pemFileData, 'base64');
    const output = Buffer.alloc(256);
    const expectedOutput = Buffer.from(
      'VocBRhpMmQ2XCzVehWSqheQLnU889gf3dhU4AnVnQTJjsKx/CM23qKDPkZDd2A/BnQsp99SN7ksIX5Raj0TPwyN5OCN/YrNFNGoOFlTsGhgP/hyE8X3Duiq6sNO0SMvRYNPFFGlJFsp1Fw3Z94eYMg4/Wpw5s4+Jo5Zm/qY7aTJIqDKDQ3CNHLeJgcMUOc9sz01/GzoUYKDVODHSxrYEk5ireFJFz9vP8P7Ha+VDUZuQIQdXer9NBbGFtYmWprY3nn4D3Dw93Sn0V0dIqYeIo91oKyslvMebmUM95S2PyIJdEpPb2DJDxjvX/0LLwSWlSXRWy9gapWoBkb4ynqZBsg==',
      'base64'
    );
    const { signRsaSha256Hook } = cryptoCallbacks;
    const err = signRsaSha256Hook(key, input, output);
    if (err instanceof Error) {
      expect(err).to.not.exist;
    }
    expect(output).to.deep.equal(expectedOutput);
  });

  it('should invoke crypto callbacks when doing encryption', async function () {
    function assertCertainHooksCalled(expectedSet?) {
      expectedSet = expectedSet || new Set([]);
      for (const name of hookNames) {
        const hook = cryptoCallbacks[name];
        if (expectedSet.has(name)) {
          expect(hook).to.have.been.called;
        } else {
          expect(hook).to.not.have.been.called;
        }
        hook.resetHistory();
      }
    }
    const encryption = new ClientEncryption(client, {
      keyVaultNamespace: 'test.encryption',
      kmsProviders
    });
    assertCertainHooksCalled();
    const dataKeyId = await encryption.createDataKey('aws', dataKeyOptions);
    assertCertainHooksCalled(new Set(['hmacSha256Hook', 'sha256Hook', 'randomHook']));
    const encryptOptions = {
      keyId: dataKeyId,
      algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
    };
    const encryptedValue = await encryption.encrypt('hello', encryptOptions);
    assertCertainHooksCalled(
      new Set(['aes256CbcEncryptHook', 'hmacSha512Hook', 'hmacSha256Hook', 'sha256Hook'])
    );
    await encryption.decrypt(encryptedValue);
    assertCertainHooksCalled(new Set(['aes256CbcDecryptHook', 'hmacSha512Hook']));
  });

  describe('error testing', function () {
    beforeEach(async function () {
      sandbox?.restore();
    });
    for (const hookName of ['aes256CbcEncryptHook', 'aes256CbcDecryptHook', 'hmacSha512Hook']) {
      it(`should properly propagate an error when ${hookName} fails`, async function () {
        const error = new Error('some random error text');
        sandbox.stub(cryptoCallbacks, hookName).returns(error);
        const encryption = new ClientEncryption(client, {
          keyVaultNamespace: 'test.encryption',
          kmsProviders
        });
        const result = await (async () => {
          const dataKeyId = await encryption.createDataKey('aws', dataKeyOptions);
          const encryptOptions = {
            keyId: dataKeyId,
            algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
          };
          const encryptedValue = await encryption.encrypt('hello', encryptOptions);
          await encryption.decrypt(encryptedValue);
        })().then(
          () => null,
          error => error
        );
        expect(result).to.be.instanceOf(Error);
      });
    }
    // These ones will fail with an error, but that error will get overridden
    // with "failed to create KMS message" in mongocrypt-kms-ctx.c
    for (const hookName of ['hmacSha256Hook', 'sha256Hook']) {
      it(`should error with a specific kms error when ${hookName} fails`, async function () {
        const error = new Error('some random error text');
        sandbox.stub(cryptoCallbacks, hookName).returns(error);
        const encryption = new ClientEncryption(client, {
          keyVaultNamespace: 'test.encryption',
          kmsProviders
        });
        const result = await encryption.createDataKey('aws', dataKeyOptions).catch(error => error);
        expect(result).to.match(/failed to create KMS message/);
      });
    }

    it('should error asynchronously with error when randomHook fails', async function () {
      const error = new Error('some random error text');
      sandbox.stub(cryptoCallbacks, 'randomHook').returns(error);
      const encryption = new ClientEncryption(client, {
        keyVaultNamespace: 'test.encryption',
        kmsProviders
      });
      const result = await encryption.createDataKey('aws', dataKeyOptions).catch(error => error);
      expect(result).to.have.property('message', 'some random error text');
    });
  });
});
