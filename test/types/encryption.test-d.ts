import { expectAssignable, expectNotAssignable } from 'tsd';

import type { AutoEncryptionOptions } from '../mongodb';

// Empty credentials support on each provider
expectAssignable<AutoEncryptionOptions>({
  kmsProviders: {
    gcp: {},
    aws: {}
  }
});

// TODO(NODE-XXXX): Azure support
expectNotAssignable<AutoEncryptionOptions>({
  kmsProviders: {
    azure: {}
  }
});
