import { MongoError } from './error';

function makeErrorModule(error: any) {
  const props = error ? { kModuleError: error } : {};
  return new Proxy(props, {
    get: (_: any, key: any) => {
      if (key === 'kModuleError') {
        return error;
      }
      throw error;
    },
    set: () => {
      throw error;
    }
  });
}

export let Kerberos: typeof import('kerberos') = makeErrorModule(
  new MongoError(
    'Optional module `kerberos` not found. Please install it to enable kerberos authentication'
  )
);

try {
  Kerberos = require('kerberos');
} catch {} // eslint-disable-line

export let Snappy: typeof import('snappy') = makeErrorModule(
  new MongoError(
    'Optional module `snappy` not found. Please install it to enable snappy compression'
  )
);

try {
  Snappy = require('snappy');
} catch {} // eslint-disable-line

export let saslprep: typeof import('saslprep') = makeErrorModule(
  new MongoError(
    'Optional module `saslprep` not found.' +
      ' Please install it to enable Stringprep Profile for User Names and Passwords'
  )
);

try {
  saslprep = require('saslprep');
} catch {} // eslint-disable-line

export let aws4: typeof import('aws4') = makeErrorModule(
  new MongoError('Optional module `aws4` not found. Please install it to enable AWS authentication')
);

try {
  aws4 = require('aws4');
} catch {} // eslint-disable-line
