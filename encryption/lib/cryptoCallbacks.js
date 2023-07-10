'use strict';
const crypto = require('crypto');

function makeAES256Hook(method, mode) {
  return function (key, iv, input, output) {
    let result;

    try {
      let cipher = crypto[method](mode, key, iv);
      cipher.setAutoPadding(false);
      result = cipher.update(input);
      const final = cipher.final();
      if (final.length > 0) {
        result = Buffer.concat([result, final]);
      }
    } catch (e) {
      return e;
    }

    result.copy(output);
    return result.length;
  };
}

function randomHook(buffer, count) {
  try {
    crypto.randomFillSync(buffer, 0, count);
  } catch (e) {
    return e;
  }
  return count;
}

function sha256Hook(input, output) {
  let result;
  try {
    result = crypto.createHash('sha256').update(input).digest();
  } catch (e) {
    return e;
  }

  result.copy(output);
  return result.length;
}

function makeHmacHook(algorithm) {
  return (key, input, output) => {
    let result;
    try {
      result = crypto.createHmac(algorithm, key).update(input).digest();
    } catch (e) {
      return e;
    }

    result.copy(output);
    return result.length;
  };
}

function signRsaSha256Hook(key, input, output) {
  let result;
  try {
    const signer = crypto.createSign('sha256WithRSAEncryption');
    const privateKey = Buffer.from(
      `-----BEGIN PRIVATE KEY-----\n${key.toString('base64')}\n-----END PRIVATE KEY-----\n`
    );

    result = signer.update(input).end().sign(privateKey);
  } catch (e) {
    return e;
  }

  result.copy(output);
  return result.length;
}

module.exports = {
  aes256CbcEncryptHook: makeAES256Hook('createCipheriv', 'aes-256-cbc'),
  aes256CbcDecryptHook: makeAES256Hook('createDecipheriv', 'aes-256-cbc'),
  aes256CtrEncryptHook: makeAES256Hook('createCipheriv', 'aes-256-ctr'),
  aes256CtrDecryptHook: makeAES256Hook('createDecipheriv', 'aes-256-ctr'),
  randomHook,
  hmacSha512Hook: makeHmacHook('sha512'),
  hmacSha256Hook: makeHmacHook('sha256'),
  sha256Hook,
  signRsaSha256Hook
};
