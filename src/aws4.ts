import * as crypto from 'node:crypto';
import * as queryString from 'node:querystring';

export interface AWS4 {
  /**
   * Created these inline types to better assert future usage of this API
   * @param options - options for request
   * @param credentials - AWS credential details, sessionToken should be omitted entirely if its false-y
   */
  sign(
    this: void,
    options: {
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
    },
    credentials:
      | {
          accessKeyId: string;
          secretAccessKey: string;
          sessionToken: string;
        }
      | {
          accessKeyId: string;
          secretAccessKey: string;
        }
      | undefined
  ): {
    headers: {
      Authorization: string;
      'X-Amz-Date': string;
    };
  };
}

export function aws4Sign(
  this: void,
  options: {
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
  },
  credentials:
    | {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken: string;
      }
    | {
        accessKeyId: string;
        secretAccessKey: string;
      }
    | undefined
): {
  headers: {
    Authorization: string;
    'X-Amz-Date': string;
  };
} {
  let path: string;
  let query: queryString.ParsedUrlQuery | undefined;

  const encode = (str: string) => {
    const encoded = encodeURIComponent(str);
    const replaced = encoded.replace(/[!'()*]/g, function (c) {
      return '%' + c.charCodeAt(0).toString(16).toUpperCase();
    });
    return replaced;
  };

  const queryIndex = options.path.indexOf('?');
  if (queryIndex < 0) {
    path = options.path;
    query = undefined;
  } else {
    path = options.path.slice(0, queryIndex);
    query = queryString.parse(options.path.slice(queryIndex + 1));
  }

  let canonicalQuerystring = '';
  if (query) {
    const isS3 = options.service === 's3';
    const useFirstArrayValue = isS3;
    // const decodeSlashesInPath = isS3;
    // const decodePath = isS3;
    // const normalizePath = !isS3;
    const queryStrings: string[] = [];
    const sortedQueryKeys = Object.keys(query).sort();
    for (const key of sortedQueryKeys) {
      if (!key) {
        continue;
      }

      const encodedKey = encode(key);
      let value: string | string[] | undefined = query[key];
      if (Array.isArray(value)) {
        let values: string[] = value;
        if (useFirstArrayValue) {
          values = [value[0]];
        }

        for (const item of values) {
          const encodedValue = encode(item);
          queryStrings.push(`${encodedKey}=${encodedValue}`);
        }
      } else {
        value = value ?? '';
        const encodedValue = encode(value);
        queryStrings.push(`${encodedKey}=${encodedValue}`);
      }
    }
    canonicalQuerystring = queryStrings.join('&');
  }

  const convertHeaderValue = (value: string | number) => {
    return value.toString().trim().replace(/\s+/g, ' ');
  };
  const headers: string[] = [
    `content-length:${convertHeaderValue(options.headers['Content-Length'])}\n`,
    `content-type:${convertHeaderValue(options.headers['Content-Type'])}\n`,
    `x-mongodb-gs2-cb-flag:${convertHeaderValue(options.headers['X-MongoDB-GS2-CB-Flag'])}\n`,
    `x-mongodb-server-nonce:${convertHeaderValue(options.headers['X-MongoDB-Server-Nonce'])}\n`
  ];
  const canonicalHeaders = headers.sort().join('\n');

  const signedHeaders = 'content-length;content-type;x-mongodb-gs2-cb-flag;x-mongodb-server-nonce';

  const getHash = (str: string): string => {
    return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
  };
  const getHmac = (key: string, str: string): string => {
    return crypto.createHmac('sha256', key).update(str, 'utf8').digest('hex');
  };
  const hashedPayload = getHash(options.body || '');

  const canonicalUri = path;
  const canonicalRequest = [
    options.method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    hashedPayload
  ].join('\n');

  const canonicRequestHash = getHash(canonicalRequest);
  const requestDateTime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const requestDate = requestDateTime.substring(0, 8);
  const credentialScope = `${requestDate}/${options.region}/${options.service}/aws4_request`;

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    requestDateTime,
    credentialScope,
    canonicRequestHash
  ].join('\n');

  const getEnvCredentials = () => {
    const env = process.env;
    return {
      accessKeyId: env.AWS_ACCESS_KEY_ID || env.AWS_ACCESS_KEY,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY || env.AWS_SECRET_KEY,
      sessionToken: env.AWS_SESSION_TOKEN
    };
  };
  const creds = credentials || getEnvCredentials();
  const dateKey = getHmac('AWS4' + creds.secretAccessKey, requestDate);
  const dateRegionKey = getHmac(dateKey, options.region);
  const dateRegionServiceKey = getHmac(dateRegionKey, options.service);
  const signingKey = getHmac(dateRegionServiceKey, 'aws4_request');
  const signature = getHmac(signingKey, stringToSign);

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

// export const aws4: AWS4 = {
//   sign: aws4Sign
// };
