import { expectError } from 'tsd';

import type { ChangeStreamOptions } from '../../src';

declare const changeStreamOptions: ChangeStreamOptions;

// TODO(NODE-4076)
// The types of `ChangeStreamOptions.fullDocument` should be strenghened to
// only allow the value `updateLookup` but this cannot be done until node v5.
// At that time, this test can be removed (or reworked if we think that's valuable).
expectError<'updateLookup' | undefined>(changeStreamOptions.fullDocument);
