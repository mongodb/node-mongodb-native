import * as crypto from 'crypto';

export function makeAES256Hook(method, mode) {
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

export function randomHook(buffer, count) {
  try {
    crypto.randomFillSync(buffer, 0, count);
  } catch (e) {
    return e;
  }
  return count;
}

export function sha256Hook(input, output) {
  let result;
  try {
    result = crypto.createHash('sha256').update(input).digest();
  } catch (e) {
    return e;
  }

  result.copy(output);
  return result.length;
}

export function makeHmacHook(algorithm) {
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

export function signRsaSha256Hook(key, input, output) {
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


export const aes256CbcEncryptHook = makeAES256Hook('createCipheriv', 'aes-256-cbc');
export const aes256CbcDecryptHook = makeAES256Hook('createDecipheriv', 'aes-256-cbc');
export const aes256CtrEncryptHook = makeAES256Hook('createCipheriv', 'aes-256-ctr');
export const aes256CtrDecryptHook = makeAES256Hook('createDecipheriv', 'aes-256-ctr');
export const hmacSha512Hook = makeHmacHook('sha512');
export const hmacSha256Hook = makeHmacHook('sha256');
