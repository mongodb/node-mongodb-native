import { expectAssignable } from 'tsd';

import type { AutoEncryptionOptions } from '../mongodb';

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
