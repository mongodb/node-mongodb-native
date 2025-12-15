import * as crypto from 'node:crypto';

export type Options = {
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
  date?: Date;
};

export type AwsSessionCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
};

export type AwsLongtermCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
};

export type SignedHeaders = {
  headers: {
    Authorization: string;
    'X-Amz-Date': string;
  };
};

export interface AWS4 {
  /**
   * Created these inline types to better assert future usage of this API
   * @param options - options for request
   * @param credentials - AWS credential details, sessionToken should be omitted entirely if its false-y
   */
  sign(
    this: void,
    options: Options,
    credentials: AwsSessionCredentials | AwsLongtermCredentials | undefined
  ): SignedHeaders;
}

const getHash = (str: string): string => {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
};
const getHmacArray = (key: string | Uint8Array, str: string): Uint8Array => {
  return crypto.createHmac('sha256', key).update(str, 'utf8').digest();
};
const getHmacString = (key: Uint8Array, str: string): string => {
  return crypto.createHmac('sha256', key).update(str, 'utf8').digest('hex');
};

const getEnvCredentials = () => {
  const env = process.env;
  return {
    accessKeyId: env.AWS_ACCESS_KEY_ID || env.AWS_ACCESS_KEY,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY || env.AWS_SECRET_KEY,
    sessionToken: env.AWS_SESSION_TOKEN
  };
};

const convertHeaderValue = (value: string | number) => {
  return value.toString().trim().replace(/\s+/g, ' ');
};

export function aws4Sign(
  this: void,
  options: Options,
  credentials: AwsSessionCredentials | AwsLongtermCredentials | undefined
): SignedHeaders {
  const method = options.method;
  const canonicalUri = options.path;
  const canonicalQuerystring = '';
  const creds = credentials || getEnvCredentials();

  const date = options.date || new Date();
  const requestDateTime = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const requestDate = requestDateTime.substring(0, 8);

  const headers: string[] = [
    `content-length:${convertHeaderValue(options.headers['Content-Length'])}`,
    `content-type:${convertHeaderValue(options.headers['Content-Type'])}`,
    `host:${convertHeaderValue(options.host)}`,
    `x-amz-date:${convertHeaderValue(requestDateTime)}`,
    `x-mongodb-gs2-cb-flag:${convertHeaderValue(options.headers['X-MongoDB-GS2-CB-Flag'])}`,
    `x-mongodb-server-nonce:${convertHeaderValue(options.headers['X-MongoDB-Server-Nonce'])}`
  ];
  if ('sessionToken' in creds && creds.sessionToken) {
    headers.push(`x-amz-security-token:${convertHeaderValue(creds.sessionToken)}`);
  }
  const canonicalHeaders = headers.sort().join('\n');
  const canonicalHeaderNames = headers.map(header => header.split(':', 2)[0].toLowerCase());
  const signedHeaders = canonicalHeaderNames.sort().join(';');

  const hashedPayload = getHash(options.body || '');

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders + '\n',
    signedHeaders,
    hashedPayload
  ].join('\n');

  const canonicalRequestHash = getHash(canonicalRequest);
  const credentialScope = `${requestDate}/${options.region}/${options.service}/aws4_request`;

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    requestDateTime,
    credentialScope,
    canonicalRequestHash
  ].join('\n');

  const dateKey = getHmacArray('AWS4' + creds.secretAccessKey, requestDate);
  const dateRegionKey = getHmacArray(dateKey, options.region);
  const dateRegionServiceKey = getHmacArray(dateRegionKey, options.service);
  const signingKey = getHmacArray(dateRegionServiceKey, 'aws4_request');
  const signature = getHmacString(signingKey, stringToSign);

  const authorizationHeader = [
    'AWS4-HMAC-SHA256 Credential=' + creds.accessKeyId + '/' + credentialScope,
    'SignedHeaders=' + signedHeaders,
    'Signature=' + signature
  ].join(', ');

  return {
    headers: {
      Authorization: authorizationHeader,
      'X-Amz-Date': requestDateTime
    }
  };
}
