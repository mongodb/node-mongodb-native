import { expectAssignable, expectNotAssignable } from 'tsd';

import type { IndexDescription } from '../mongodb';

// test that all valid index options are allowed in IndexDescription
expectAssignable<IndexDescription>({ key: {}, background: true });
expectAssignable<IndexDescription>({ key: {}, expireAfterSeconds: 2400 });
expectAssignable<IndexDescription>({ key: {}, name: 'index_1' });
expectAssignable<IndexDescription>({ key: {}, sparse: true });
expectAssignable<IndexDescription>({ key: {}, storageEngine: {} });
expectAssignable<IndexDescription>({ key: {}, unique: true });
expectAssignable<IndexDescription>({ key: {}, version: 1 });
expectAssignable<IndexDescription>({ key: {}, default_language: 'english' });
expectAssignable<IndexDescription>({ key: {}, language_override: 'english' });
expectAssignable<IndexDescription>({ key: {}, textIndexVersion: 2 });
expectAssignable<IndexDescription>({ key: {}, weights: {} });
expectAssignable<IndexDescription>({ key: {}, '2dsphereIndexVersion': 2 });
expectAssignable<IndexDescription>({ key: {}, bits: 1 });
expectAssignable<IndexDescription>({ key: {}, max: 1.1 });
expectAssignable<IndexDescription>({ key: {}, min: 9.9 });
expectAssignable<IndexDescription>({ key: {}, bucketSize: 100 });
expectAssignable<IndexDescription>({ key: {}, partialFilterExpression: {} });
expectAssignable<IndexDescription>({ key: {}, collation: { locale: 'en' } });
expectAssignable<IndexDescription>({ key: {}, wildcardProjection: {} });
expectAssignable<IndexDescription>({ key: {}, hidden: true });
expectNotAssignable<IndexDescription>({ key: {}, invalidOption: 2400 });
