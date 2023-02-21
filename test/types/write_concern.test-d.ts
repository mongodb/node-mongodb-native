import { expectNotAssignable } from 'tsd';

import type { FindOptions, ListCollectionsOptions, ListIndexesOptions } from '../mongodb';

expectNotAssignable<FindOptions>({ writeConcern: { w: 0 } });
expectNotAssignable<ListCollectionsOptions>({ writeConcern: { w: 0 } });
expectNotAssignable<ListIndexesOptions>({ writeConcern: { w: 0 } });
