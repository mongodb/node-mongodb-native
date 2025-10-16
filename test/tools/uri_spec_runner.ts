import { expect } from 'chai';

import {
  MongoAPIError,
  MongoClient,
  MongoInvalidArgumentError,
  MongoParseError,
  MongoRuntimeError
} from '../../src';

type HostObject = {
  type: 'ipv4' | 'ip_literal' | 'hostname' | 'unix';
  host: string;
  port: number;
};

type UriTestBase = {
  description: string;
  uri: string;
  valid: boolean;
};

interface UriTest extends UriTestBase {
  warning: boolean;
  hosts: HostObject[];
  auth: {
    username: string;
    password: string;
    db: string;
  };
  options: Record<string, any> | null;
}

interface AuthTest extends UriTestBase {
  credential: {
    username: string;
    password: string;
    source: string;
    mechanism: string;
    mechanism_properties: Record<string, any>;
  };
}

function isAuthTest(test: AuthTest | UriTest): test is AuthTest {
  return !('options' in test);
}

function isUriTest(test: AuthTest | UriTest): test is UriTest {
  return 'options' in test;
}

export function executeUriValidationTest(
  test: UriTest | AuthTest,
  shouldNotThrowOnWarn = false
): void {
  const knownTestKeys = [
    'callback',
    'description',
    'uri',
    'valid',
    'warning',
    'hosts',
    'auth',
    'options',
    'credential'
  ];
  expect(knownTestKeys).to.include.members(Object.keys(test));

  const errorMessage = `"${test.uri}"`;

  const valid = test.valid && (!(test as UriTest).warning || shouldNotThrowOnWarn);

  if (!valid) {
    try {
      new MongoClient(test.uri);
      expect.fail(`Expected "${test.uri}" to be invalid${test.valid ? ' because of warning' : ''}`);
    } catch (err) {
      if (err instanceof MongoInvalidArgumentError) {
        // Azure URI errors don't have an underlying cause.
      } else if (err instanceof MongoRuntimeError) {
        expect(err).to.have.nested.property('cause.code').equal('ERR_INVALID_URL');
      } else if (
        // most of our validation is MongoParseError, which does not extend from MongoAPIError
        !(err instanceof MongoParseError) &&
        // the rest of our validation extends from MongoAPIError
        !(err instanceof MongoAPIError) &&
        // mongodb-connection-string-url does not export its MongoParseError so we can't check for it directly
        err.name !== 'MongoParseError'
      ) {
        throw err;
      }
    }
    return;
  }

  // If a callback is specified in the spec test, we need to pass in references to those callbacks
  // in the actual options provided to the MongoClient. This is because OIDC does not allow
  // functions for callbacks in the URI itself but needs to validate they are passed.
  const CALLBACKS = {
    oidcRequest: async () => {
      return { accessToken: '<test>' };
    }
  };

  const CALLBACK_MAPPINGS = {
    oidcRequest: 'OIDC_TOKEN_CALLBACK'
  };

  const mongoClientOptions = {};

  if (test.callback) {
    const authMechanismProperties = Object.create(null);
    for (const callback of test.callback) {
      authMechanismProperties[CALLBACK_MAPPINGS[callback]] = CALLBACKS[callback];
    }
    mongoClientOptions.authMechanismProperties = authMechanismProperties;
  }

  const client = new MongoClient(test.uri, mongoClientOptions);
  const options = client.options;
  expect(options, errorMessage).to.be.an('object').that.is.not.empty;

  // non-auth tests can have an expected value for hosts
  if (isUriTest(test) && test.hosts != null) {
    for (const [index, { host, port }] of test.hosts.entries()) {
      const actualHost = options.hosts[index];
      if (actualHost.host == null && actualHost.socketPath == null) {
        expect.fail('Expected host to define "host" or "socketPath" properties');
      }
      if (actualHost.host != null) {
        expect(actualHost, errorMessage).property('host').to.equal(host);
      } else {
        expect(actualHost, errorMessage).property('socketPath').to.equal(host);
      }

      if (port != null) expect(actualHost).property('port').to.equal(port);
    }
  }

  // depending on whether this is a UriTest or an AuthTest,
  // expected credential option values are defined in test.auth or test.credential, respectively,
  // and additional expected property values are defined in test.options or mixed into test.credential, respectively
  let credentialsToTest: { source?: string; password?: string; username?: string } = {};
  let optionsToTest: Record<string, any> = isUriTest(test) ? test.options || {} : {};

  if (isAuthTest(test) && test.credential != null) {
    // handle AuthTest credential testing

    // Note: unlike the other URI tests, we cannot test dbName
    // because the auth tests do not provide an expected value for it

    const credentialOptions = [
      'username',
      'password',
      'source',
      'mechanism',
      'mechanism_properties'
    ];
    expect(test).property('credential').to.have.all.keys(credentialOptions);

    optionsToTest = (({ mechanism, mechanism_properties }) => ({
      mechanism,
      mechanism_properties
    }))(test.credential);

    credentialsToTest = (({ username, password, source }) => ({
      username,
      password,
      source
    }))(test.credential);
  } else if (isUriTest(test) && test.auth !== null) {
    // handle UriTest credential and dbName testing
    const credentialOptions = ['username', 'password', 'db'];
    expect(test).property('auth').to.have.all.keys(credentialOptions);

    credentialsToTest = (({ username, password, db }) => ({
      username,
      password,
      source: db
    }))(test.auth);

    if (test.auth.db !== null) {
      expect(options, `${errorMessage} dbName`).to.have.property('dbName').equal(test.auth.db);
    } else {
      expect(options, `${errorMessage} default dbName`).to.have.property('dbName').equal('test');
    }
  }

  if (credentialsToTest.username != null) {
    expect(options, errorMessage).to.have.property('credentials');
    for (const [prop, value] of Object.entries(credentialsToTest)) {
      if (value != null) {
        expect(options, `${errorMessage} ${prop}`)
          .to.have.nested.property(`credentials.${prop}`)
          .equal(value);
      }
    }
  }

  for (const [optionKey, optionValue] of Object.entries(optionsToTest)) {
    let expectedProp;
    switch (optionKey) {
      //** AUTH OPTIONS **/
      case 'authSource':
        expectedProp = 'credentials.source';
        expect(options, `${errorMessage} ${optionKey} -> ${expectedProp}`)
          .to.have.nested.property(expectedProp)
          .equal(optionValue);
        break;
      case 'authmechanism':
      case 'authMechanism':
      case 'mechanism':
        expectedProp = 'credentials.mechanism';
        expect(options, `${errorMessage} ${optionKey} -> ${expectedProp}`)
          .to.have.nested.property(expectedProp)
          .equal(optionValue ?? 'DEFAULT');
        break;
      case 'authmechanismproperties':
      case 'authMechanismProperties':
      case 'mechanism_properties':
        for (const [expectedMechProp, expectedMechValue] of Object.entries(optionValue || {})) {
          if (
            expectedMechProp === 'SERVICE_NAME' &&
            options.credentials.mechanismProperties &&
            !options.credentials.mechanismProperties.SERVICE_NAME
          ) {
            // TODO(NODE-3925): Ensure default SERVICE_NAME is set on the parsed mechanism properties
            continue;
          }
          if (expectedMechProp === 'OIDC_TOKEN_CALLBACK') {
            expect(
              options,
              `${errorMessage} credentials.mechanismProperties.${expectedMechProp}`
            ).to.have.nested.property(`credentials.mechanismProperties.${expectedMechProp}`);
          } else {
            expect(options, `${errorMessage} credentials.mechanismProperties.${expectedMechProp}`)
              .to.have.nested.property(`credentials.mechanismProperties.${expectedMechProp}`)
              .equal(expectedMechValue);
          }
        }
        break;

      //** READ CONCERN OPTIONS **/
      case 'readConcernLevel':
        expectedProp = 'readConcern.level';
        expect(options, `${errorMessage} ${optionKey} -> ${expectedProp}`)
          .to.have.nested.property(expectedProp)
          .equal(optionValue);
        break;
      case 'readPreference':
        expectedProp = 'readPreference.mode';
        expect(options, `${errorMessage} ${optionKey} -> ${expectedProp}`)
          .to.have.nested.property(expectedProp)
          .deep.equal(optionValue);
        break;
      case 'readPreferenceTags':
        expectedProp = 'readPreference.tags';
        expect(options, `${errorMessage} ${optionKey} -> ${expectedProp}`)
          .to.have.nested.property(expectedProp)
          .deep.equal(optionValue);
        break;
      case 'maxStalenessSeconds':
        expectedProp = 'readPreference.maxStalenessSeconds';
        expect(options, `${errorMessage} ${optionKey} -> ${expectedProp}`)
          .to.have.nested.property(expectedProp)
          .deep.equal(optionValue);
        break;

      //** WRITE CONCERN OPTIONS **/
      case 'w':
        expectedProp = 'writeConcern.w';
        expect(options, `${errorMessage} ${optionKey} -> ${expectedProp}`)
          .to.have.nested.property(expectedProp)
          .equal(optionValue);
        break;
      case 'wTimeoutMS':
      case 'wtimeoutms':
        expectedProp = 'writeConcern.wtimeout';
        expect(options, `${errorMessage} ${optionKey} -> ${expectedProp}`)
          .to.have.nested.property(expectedProp)
          .equal(optionValue);
        break;
      case 'journal':
        expectedProp = 'writeConcern.j';
        expect(options, `${errorMessage} ${optionKey} -> ${expectedProp}`)
          .to.have.nested.property(expectedProp)
          .equal(optionValue);
        break;

      //** TLS OPTIONS **/
      case 'tlsAllowInvalidCertificates':
        expectedProp = 'rejectUnauthorized';
        expect(options, `${errorMessage} ${optionKey} -> ${expectedProp}`)
          .to.have.property(expectedProp)
          .equal(!optionValue);
        break;
      case 'tlsAllowInvalidHostnames':
        expectedProp = 'checkServerIdentity';
        expect(options, `${errorMessage} ${optionKey} -> ${expectedProp}`)
          .to.have.property(expectedProp)
          .that.is.a(optionValue ? 'function' : 'undefined');
        break;
      case 'tlsInsecure':
        expect(options, `${errorMessage} tlsInsecure -> rejectUnauthorized`)
          .to.have.property('rejectUnauthorized')
          .equal(!optionValue);
        expect(options, `${errorMessage} tlsInsecure -> checkServerIdentity`)
          .to.have.property('checkServerIdentity')
          .that.is.a(optionValue ? 'function' : 'undefined');
        break;
      case 'tlsCertificateKeyFilePassword':
        expectedProp = 'passphrase';
        expect(options, `${errorMessage} ${optionKey} -> ${expectedProp}`)
          .to.have.property(expectedProp)
          .equal(optionValue);
        break;
      case 'tlsCertificateKeyFile':
        expectedProp = 'tlsCertificateKeyFile';
        expect(options, `${errorMessage} ${optionKey} -> ${expectedProp}`)
          .to.have.property(expectedProp)
          .equal(optionValue);
        break;
      case 'tlsCAFile':
        expectedProp = 'tlsCAFile';
        expect(options, `${errorMessage} ${optionKey} -> ${expectedProp}`)
          .to.have.property(expectedProp)
          .equal(optionValue);
        break;

      //** MISC SPECIAL PARSE RULE OPTIONS **/
      case 'appname':
        expectedProp = 'appName';
        expect(options, `${errorMessage} ${optionKey} -> ${expectedProp}`)
          .to.have.nested.property(expectedProp)
          .equal(optionValue);
        break;
      case 'compressors':
        expect(options, `${errorMessage} ${optionKey}`)
          .to.have.property(optionKey)
          .deep.equal(optionValue);
        break;
      case 'replicaset': // replicaset appears with both casings in the test expectations
        expect(options, `${errorMessage} replicaSet`)
          .to.have.property('replicaSet')
          .equal(optionValue);
        break;

      //** DIRECTLY MAPPED OPTIONS **/
      case 'zlibCompressionLevel':
      case 'maxConnecting':
      case 'maxPoolSize':
      case 'minPoolSize':
      case 'timeoutMS':
      case 'connectTimeoutMS':
      case 'heartbeatFrequencyMS':
      case 'localThresholdMS':
      case 'maxIdleTimeMS':
      case 'serverSelectionTimeoutMS':
      case 'serverMonitoringMode':
      case 'socketTimeoutMS':
      case 'retryWrites':
      case 'directConnection':
      case 'loadBalanced':
      case 'replicaSet':
      case 'srvServiceName':
      case 'srvMaxHosts':
      case 'tls':
        expect(options, `${errorMessage} ${optionKey}`)
          .to.have.property(optionKey)
          .equal(optionValue);
        break;

      //** UNKNOWN OPTIONS **/
      default:
        throw Error(`This option is not covered by the spec test runner: ${optionKey}`);
    }
  }
}
