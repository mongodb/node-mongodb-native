import { BSON } from '../../bson';
import { type AWSCredentials } from '../../deps';

export type AwsSigv4Options = {
  path: '/';
  body: string;
  host: string;
  method: 'POST';
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded';
    'Content-Length': number;
    'X-MongoDB-Server-Nonce': string;
    'X-MongoDB-GS2-CB-Flag': 'n';
  };
  service: string;
  region: string;
  date: Date;
};

export type SignedHeaders = {
  Authorization: string;
  'X-Amz-Date': string;
};

/**
 * Calculates the SHA-256 hash of a string.
 *
 * @param str - String to hash.
 * @returns Hexadecimal representation of the hash.
 */
const getHexSha256 = async (str: string): Promise<string> => {
  const data = stringToBuffer(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashHex = BSON.ByteUtils.toHex(new Uint8Array(hashBuffer));
  return hashHex;
};

/**
 * Calculates the HMAC-SHA256 of a string using the provided key.
 * @param key - Key to use for HMAC calculation. Can be a string or Uint8Array.
 * @param str - String to calculate HMAC for.
 * @returns Uint8Array containing the HMAC-SHA256 digest.
 */
const getHmacSha256 = async (key: string | Uint8Array, str: string): Promise<Uint8Array> => {
  let keyData: Uint8Array;
  if (typeof key === 'string') {
    keyData = stringToBuffer(key);
  } else {
    keyData = key;
  }

  const importedKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false,
    ['sign']
  );
  const strData = stringToBuffer(str);
  const signature = await crypto.subtle.sign('HMAC', importedKey, strData);
  const digest = new Uint8Array(signature);
  return digest;
};

/**
 * Converts header values according to AWS requirements,
 * From https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html#create-canonical-request
 * For values, you must:
    - trim any leading or trailing spaces.
    - convert sequential spaces to a single space.
 * @param value - Header value to convert.
 * @returns - Converted header value.
 */
const convertHeaderValue = (value: string | number) => {
  return value.toString().trim().replace(/\s+/g, ' ');
};

/**
 * Returns a Uint8Array representation of a string, encoded in UTF-8.
 * @param str - String to convert.
 * @returns Uint8Array containing the UTF-8 encoded string.
 */
function stringToBuffer(str: string): Uint8Array {
  const data = new Uint8Array(BSON.ByteUtils.utf8ByteLength(str));
  BSON.ByteUtils.encodeUTF8Into(data, str, 0);
  return data;
}

/**
 * This method implements AWS Signature 4 logic for a very specific request format.
 * The signing logic is described here: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
 */
export async function aws4Sign(
  options: AwsSigv4Options,
  credentials: AWSCredentials
): Promise<SignedHeaders> {
  /**
   * From the spec: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
   *
   * Summary of signing steps
   * 1. Create a canonical request
   *    Arrange the contents of your request (host, action, headers, etc.) into a standard canonical format. The canonical request is one of the inputs used to create the string to sign.
   * 2. Create a hash of the canonical request
   *    Hash the canonical request using the same algorithm that you used to create the hash of the payload. The hash of the canonical request is a string of lowercase hexadecimal characters.
   * 3. Create a string to sign
   *    Create a string to sign with the canonical request and extra information such as the algorithm, request date, credential scope, and the hash of the canonical request.
   * 4. Derive a signing key
   *    Use the secret access key to derive the key used to sign the request.
   * 5. Calculate the signature
   *    Perform a keyed hash operation on the string to sign using the derived signing key as the hash key.
   * 6. Add the signature to the request
   *    Add the calculated signature to an HTTP header or to the query string of the request.
   */

  // 1: Create a canonical request

  // Date – The date and time used to sign the request.
  const date = options.date;
  // RequestDateTime – The date and time used in the credential scope. This value is the current UTC time in ISO 8601 format (for example, 20130524T000000Z).
  const requestDateTime = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  // RequestDate – The date used in the credential scope. This value is the current UTC date in YYYYMMDD format (for example, 20130524).
  const requestDate = requestDateTime.substring(0, 8);
  // Method – The HTTP request method. For us, this is always 'POST'.
  const method = options.method;
  // CanonicalUri – The URI-encoded version of the absolute path component URI, starting with the / that follows the domain name and up to the end of the string
  // For our requests, this is always '/'
  const canonicalUri = options.path;
  // CanonicalQueryString – The URI-encoded query string parameters. For our requests, there are no query string parameters, so this is always an empty string.
  const canonicalQuerystring = '';

  // CanonicalHeaders – A list of request headers with their values. Individual header name and value pairs are separated by the newline character ("\n").
  // All of our known/expected headers are included here, there are no extra headers.
  const headers = new Headers({
    'content-length': convertHeaderValue(options.headers['Content-Length']),
    'content-type': convertHeaderValue(options.headers['Content-Type']),
    host: convertHeaderValue(options.host),
    'x-amz-date': convertHeaderValue(requestDateTime),
    'x-mongodb-gs2-cb-flag': convertHeaderValue(options.headers['X-MongoDB-GS2-CB-Flag']),
    'x-mongodb-server-nonce': convertHeaderValue(options.headers['X-MongoDB-Server-Nonce'])
  });
  // If session token is provided, include it in the headers
  if ('sessionToken' in credentials && credentials.sessionToken) {
    headers.append('x-amz-security-token', convertHeaderValue(credentials.sessionToken));
  }

  // Canonical headers are lowercased and sorted.
  const canonicalHeaders = Array.from(headers.entries())
    .map(([key, value]) => `${key.toLowerCase()}:${value}`)
    .sort()
    .join('\n');
  const canonicalHeaderNames = Array.from(headers.keys()).map(header => header.toLowerCase());
  // SignedHeaders – An alphabetically sorted, semicolon-separated list of lowercase request header names.
  const signedHeaders = canonicalHeaderNames.sort().join(';');

  // HashedPayload – A string created using the payload in the body of the HTTP request as input to a hash function. This string uses lowercase hexadecimal characters.
  const hashedPayload = await getHexSha256(options.body);

  // CanonicalRequest – A string that includes the above elements, separated by newline characters.
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders + '\n',
    signedHeaders,
    hashedPayload
  ].join('\n');

  // 2. Create a hash of the canonical request
  // HashedCanonicalRequest – A string created by using the canonical request as input to a hash function.
  const hashedCanonicalRequest = await getHexSha256(canonicalRequest);

  // 3. Create a string to sign
  // Algorithm – The algorithm used to create the hash of the canonical request. For SigV4, use AWS4-HMAC-SHA256.
  const algorithm = 'AWS4-HMAC-SHA256';
  // CredentialScope – The credential scope, which restricts the resulting signature to the specified Region and service.
  // Has the following format: YYYYMMDD/region/service/aws4_request.
  const credentialScope = `${requestDate}/${options.region}/${options.service}/aws4_request`;
  // StringToSign – A string that includes the above elements, separated by newline characters.
  const stringToSign = [algorithm, requestDateTime, credentialScope, hashedCanonicalRequest].join(
    '\n'
  );

  // 4. Derive a signing key
  // To derive a signing key for SigV4, perform a succession of keyed hash operations (HMAC) on the request date, Region, and service, with your AWS secret access key as the key for the initial hashing operation.
  const dateKey = await getHmacSha256('AWS4' + credentials.secretAccessKey, requestDate);
  const dateRegionKey = await getHmacSha256(dateKey, options.region);
  const dateRegionServiceKey = await getHmacSha256(dateRegionKey, options.service);
  const signingKey = await getHmacSha256(dateRegionServiceKey, 'aws4_request');

  // 5. Calculate the signature
  const signatureBuffer = await getHmacSha256(signingKey, stringToSign);
  const signature = BSON.ByteUtils.toHex(signatureBuffer);

  // 6. Add the signature to the request
  // Calculate the Authorization header
  const authorizationHeader = [
    'AWS4-HMAC-SHA256 Credential=' + credentials.accessKeyId + '/' + credentialScope,
    'SignedHeaders=' + signedHeaders,
    'Signature=' + signature
  ].join(', ');

  // Return the calculated headers
  return {
    Authorization: authorizationHeader,
    'X-Amz-Date': requestDateTime
  };
}
