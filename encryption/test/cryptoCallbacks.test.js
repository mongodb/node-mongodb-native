'use strict';

const sinon = require('sinon');
const { expect } = require('chai');
const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const stateMachine = require('../lib/stateMachine')({ mongodb });
const cryptoCallbacks = require('../lib/cryptoCallbacks');
const ClientEncryption = require('../lib/clientEncryption')({
  mongodb,
  stateMachine
}).ClientEncryption;

const requirements = require('./requirements.helper');

// Data Key Stuff
const kmsProviders = Object.assign({}, requirements.awsKmsProviders);
const dataKeyOptions = Object.assign({}, requirements.awsDataKeyOptions);

describe('cryptoCallbacks', function () {
  before(function () {
    if (requirements.SKIP_AWS_TESTS) {
      console.error('Skipping crypto callback tests');
      return;
    }
    this.sinon = sinon.createSandbox();
  });

  beforeEach(function () {
    if (requirements.SKIP_AWS_TESTS) {
      this.currentTest.skipReason = `requirements.SKIP_AWS_TESTS=${requirements.SKIP_AWS_TESTS}`;
      this.test.skip();
      return;
    }
    this.sinon.restore();
    this.client = new MongoClient('mongodb://localhost:27017/', {
      useUnifiedTopology: true,
      useNewUrlParser: true
    });

    return this.client.connect();
  });

  afterEach(function () {
    if (requirements.SKIP_AWS_TESTS) {
      return;
    }
    this.sinon.restore();
    let p = Promise.resolve();
    if (this.client) {
      p = p.then(() => this.client.close()).then(() => (this.client = undefined));
    }

    return p;
  });

  after(function () {
    this.sinon = undefined;
  });

  // TODO(NODE-3370): fix key formatting error "asn1_check_tlen:wrong tag"
  it.skip('should support support crypto callback for signing RSA-SHA256', function () {
    const input = Buffer.from('data to sign');
    const pemFileData =
      '-----BEGIN PRIVATE KEY-----\n' +
      'MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC4JOyv5z05cL18ztpknRC7CFY2gYol4DAKerdVUoDJxCTmFMf39dVUEqD0WDiw/qcRtSO1/FRut08PlSPmvbyKetsLoxlpS8lukSzEFpFK7+L+R4miFOl6HvECyg7lbC1H/WGAhIz9yZRlXhRo9qmO/fB6PV9IeYtU+1xYuXicjCDPp36uuxBAnCz7JfvxJ3mdVc0vpSkbSb141nWuKNYR1mgyvvL6KzxO6mYsCo4hRAdhuizD9C4jDHk0V2gDCFBk0h8SLEdzStX8L0jG90/Og4y7J1b/cPo/kbYokkYisxe8cPlsvGBf+rZex7XPxc1yWaP080qeABJb+S88O//LAgMBAAECggEBAKVxP1m3FzHBUe2NZ3fYCc0Qa2zjK7xl1KPFp2u4CU+9sy0oZJUqQHUdm5CMprqWwIHPTftWboFenmCwrSXFOFzujljBO7Z3yc1WD3NJl1ZNepLcsRJ3WWFH5V+NLJ8Bdxlj1DMEZCwr7PC5+vpnCuYWzvT0qOPTl9RNVaW9VVjHouJ9Fg+s2DrShXDegFabl1iZEDdI4xScHoYBob06A5lw0WOCTayzw0Naf37lM8Y4psRAmI46XLiF/Vbuorna4hcChxDePlNLEfMipICcuxTcei1RBSlBa2t1tcnvoTy6cuYDqqImRYjp1KnMKlKQBnQ1NjS2TsRGm+F0FbreVCECgYEA4IDJlm8q/hVyNcPe4OzIcL1rsdYN3bNm2Y2O/YtRPIkQ446ItyxD06d9VuXsQpFp9jNACAPfCMSyHpPApqlxdc8z/xATlgHkcGezEOd1r4E7NdTpGg8y6Rj9b8kVlED6v4grbRhKcU6moyKUQT3+1B6ENZTOKyxuyDEgTwZHtFECgYEA0fqdv9h9s77d6eWmIioP7FSymq93pC4umxf6TVicpjpMErdD2ZfJGulN37dq8FOsOFnSmFYJdICj/PbJm6p1i8O21lsFCltEqVoVabJ7/0alPfdG2U76OeBqI8ZubL4BMnWXAB/VVEYbyWCNpQSDTjHQYs54qa2I0dJB7OgJt1sCgYEArctFQ02/7H5Rscl1yo3DBXO94SeiCFSPdC8f2Kt3MfOxvVdkAtkjkMACSbkoUsgbTVqTYSEOEc2jTgR3iQ13JgpHaFbbsq64V0QP3TAxbLIQUjYGVgQaF1UfLOBv8hrzgj45z/ST/G80lOl595+0nCUbmBcgG1AEWrmdF0/3RmECgYAKvIzKXXB3+19vcT2ga5Qq2l3TiPtOGsppRb2XrNs9qKdxIYvHmXo/9QP1V3SRW0XoD7ez8FpFabp42cmPOxUNk3FK3paQZABLxH5pzCWI9PzIAVfPDrm+sdnbgG7vAnwfL2IMMJSA3aDYGCbF9EgefG+STcpfqq7fQ6f5TBgLFwKBgCd7gn1xYL696SaKVSm7VngpXlczHVEpz3kStWR5gfzriPBxXgMVcWmcbajRser7ARpCEfbxM1UJyv6oAYZWVSNErNzNVb4POqLYcCNySuC6xKhs9FrEQnyKjyk8wI4VnrEMGrQ8e+qYSwYk9Gh6dKGoRMAPYVXQAO0fIsHF/T0a\n' +
      '-----END PRIVATE KEY-----';
    const key = Buffer.from(pemFileData);
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
  }).skipReason = 'TODO(NODE-3370): fix key formatting error "asn1_check_tlen:wrong tag"';

  const hookNames = new Set([
    'aes256CbcEncryptHook',
    'aes256CbcDecryptHook',
    'randomHook',
    'hmacSha512Hook',
    'hmacSha256Hook',
    'sha256Hook'
  ]);

  it('should invoke crypto callbacks when doing encryption', function (done) {
    for (const name of hookNames) {
      this.sinon.spy(cryptoCallbacks, name);
    }

    function assertCertainHooksCalled(expectedSet) {
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

    const encryption = new ClientEncryption(this.client, {
      keyVaultNamespace: 'test.encryption',
      kmsProviders
    });

    try {
      assertCertainHooksCalled();
    } catch (e) {
      return done(e);
    }

    encryption.createDataKey('aws', dataKeyOptions, (err, dataKey) => {
      try {
        expect(err).to.not.exist;
        assertCertainHooksCalled(new Set(['hmacSha256Hook', 'sha256Hook', 'randomHook']));
      } catch (e) {
        return done(e);
      }

      const encryptOptions = {
        keyId: dataKey,
        algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
      };

      encryption.encrypt('hello', encryptOptions, (err, encryptedValue) => {
        try {
          expect(err).to.not.exist;
          assertCertainHooksCalled(
            new Set(['aes256CbcEncryptHook', 'hmacSha512Hook', 'hmacSha256Hook', 'sha256Hook'])
          );
        } catch (e) {
          return done(e);
        }
        encryption.decrypt(encryptedValue, err => {
          try {
            expect(err).to.not.exist;
            assertCertainHooksCalled(new Set(['aes256CbcDecryptHook', 'hmacSha512Hook']));
          } catch (e) {
            return done(e);
          }
          done();
        });
      });
    });
  });

  describe('error testing', function () {
    ['aes256CbcEncryptHook', 'aes256CbcDecryptHook', 'hmacSha512Hook'].forEach(hookName => {
      it(`should properly propagate an error when ${hookName} fails`, function (done) {
        const error = new Error('some random error text');
        this.sinon.stub(cryptoCallbacks, hookName).returns(error);

        const encryption = new ClientEncryption(this.client, {
          keyVaultNamespace: 'test.encryption',
          kmsProviders
        });

        function finish(err) {
          try {
            expect(err, 'Expected an error to exist').to.exist;
            expect(err).to.have.property('message', error.message);
            done();
          } catch (e) {
            done(e);
          }
        }

        try {
          encryption.createDataKey('aws', dataKeyOptions, (err, dataKey) => {
            if (err) return finish(err);

            const encryptOptions = {
              keyId: dataKey,
              algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
            };

            encryption.encrypt('hello', encryptOptions, (err, encryptedValue) => {
              if (err) return finish(err);
              encryption.decrypt(encryptedValue, err => finish(err));
            });
          });
        } catch (e) {
          done(new Error('We should not be here'));
        }
      });
    });

    // These ones will fail with an error, but that error will get overridden
    // with "failed to create KMS message" in mongocrypt-kms-ctx.c
    ['hmacSha256Hook', 'sha256Hook'].forEach(hookName => {
      it(`should error with a specific kms error when ${hookName} fails`, function () {
        const error = new Error('some random error text');
        this.sinon.stub(cryptoCallbacks, hookName).returns(error);

        const encryption = new ClientEncryption(this.client, {
          keyVaultNamespace: 'test.encryption',
          kmsProviders
        });

        expect(() => encryption.createDataKey('aws', dataKeyOptions, () => undefined)).to.throw(
          'failed to create KMS message'
        );
      });
    });

    it('should error synchronously with error when randomHook fails', function (done) {
      const error = new Error('some random error text');
      this.sinon.stub(cryptoCallbacks, 'randomHook').returns(error);

      const encryption = new ClientEncryption(this.client, {
        keyVaultNamespace: 'test.encryption',
        kmsProviders
      });

      try {
        encryption.createDataKey('aws', dataKeyOptions, () => {
          done(new Error('We should not be here'));
        });
      } catch (err) {
        try {
          expect(err).to.have.property('message', 'some random error text');
          done();
        } catch (e) {
          done(e);
        }
      }
    });
  });
});
