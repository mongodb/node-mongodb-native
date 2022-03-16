import { expectType } from 'tsd';

import type { ChangeStreamOptions } from '../../src';

declare const changeStreamOptions: ChangeStreamOptions;

// The change stream spec says that we cannot throw an error for invalid values to `fullDocument`
// for future compatability.  This means we must leave `fullDocument` as type string.
expectType<string | undefined>(changeStreamOptions.fullDocument);
