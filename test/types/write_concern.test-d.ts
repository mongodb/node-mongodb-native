import { expectDeprecated, expectNotAssignable } from 'tsd';

import type {
  ChangeStreamOptions,
  FindOptions,
  ListCollectionsOptions,
  ListIndexesOptions,
  WriteConcern
} from '../mongodb';

expectNotAssignable<FindOptions>({ writeConcern: { w: 0 } });
expectNotAssignable<ListCollectionsOptions>({ writeConcern: { w: 0 } });
expectNotAssignable<ListIndexesOptions>({ writeConcern: { w: 0 } });
expectNotAssignable<ChangeStreamOptions>({ writeConcern: { w: 0 } });

declare const wc: WriteConcern;
expectDeprecated(wc.wtimeoutMS);
expectDeprecated(wc.wtimeout);
