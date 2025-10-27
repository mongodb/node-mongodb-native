import { expectAssignable } from 'tsd';

import type { AutoEncryptionOptions } from '../../src';

// Empty credentials support on each provider
expectAssignable<AutoEncryptionOptions>({
  kmsProviders: {
    gcp: {},
    aws: {}
  }
});

expectAssignable<AutoEncryptionOptions>({
  kmsProviders: {
    azure: {}
  }
});
