import { expectAssignable, expectNotAssignable, expectNotDeprecated } from 'tsd';

import type {
  CreateIndexesOptions,
  CreateIndexOptions,
  IndexDescription,
  IndexDescriptionInfo,
  IndexOptions
} from '../mongodb';

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

// `IndexOptions` holds options for the index itself. It uses the names the index management
// specification defines, which differ from the field names the `createIndexes` command expects for
// three of them (`version`, `defaultLanguage`, `languageOverride`).
expectAssignable<IndexOptions>({ expireAfterSeconds: 2400 });
expectAssignable<IndexOptions>({ name: 'index_1' });
expectAssignable<IndexOptions>({ sparse: true });
expectAssignable<IndexOptions>({ storageEngine: {} });
expectAssignable<IndexOptions>({ unique: true });
expectAssignable<IndexOptions>({ version: 1 });
expectAssignable<IndexOptions>({ defaultLanguage: 'english' });
expectAssignable<IndexOptions>({ languageOverride: 'language' });
expectAssignable<IndexOptions>({ textIndexVersion: 2 });
expectAssignable<IndexOptions>({ weights: {} });
expectAssignable<IndexOptions>({ '2dsphereIndexVersion': 2 });
expectAssignable<IndexOptions>({ bits: 1 });
expectAssignable<IndexOptions>({ max: 1.1 });
expectAssignable<IndexOptions>({ min: 9.9 });
expectAssignable<IndexOptions>({ bucketSize: 100 });
expectAssignable<IndexOptions>({ partialFilterExpression: {} });
expectAssignable<IndexOptions>({ collation: { locale: 'en' } });
expectAssignable<IndexOptions>({ wildcardProjection: {} });
expectAssignable<IndexOptions>({ hidden: true });

// 2dsphere cell levels are supported by the server but are not modelled by the driver; they are
// accepted because `IndexOptions` is open, and passed through to the server for validation.
expectAssignable<IndexOptions>({ finestIndexedLevel: 15 });
expectAssignable<IndexOptions>({ coarsestIndexedLevel: 3 });

// `IndexOptions` is intentionally open so that index options the driver has not learned about yet
// can be supplied and passed through to the server for validation.
expectAssignable<IndexOptions>({ anOptionTheDriverDoesNotKnowAbout: true });

// `CreateIndexOptions` holds options for the `createIndexes` command, not for the index. The
// command level options it does not declare itself are inherited from `CommandOperationOptions`.
expectAssignable<CreateIndexOptions>({ commitQuorum: 2 });
expectAssignable<CreateIndexOptions>({ commitQuorum: 'votingMembers' });
expectAssignable<CreateIndexOptions>({ maxTimeMS: 1000 });
expectAssignable<CreateIndexOptions>({ comment: 'a comment' });
expectAssignable<CreateIndexOptions>({ writeConcern: { w: 1 } });
expectAssignable<CreateIndexOptions>({ timeoutMS: 1000 });

// `collation` belongs on the index description, not at the command root, so it is omitted.
expectNotAssignable<CreateIndexOptions>({ collation: { locale: 'en' } });
// index options do not belong in the command options bag
expectNotAssignable<CreateIndexOptions>({ unique: true });

// The legacy interface combines index and command options and stays closed, so a misspelled option is
// still caught at compile time on the two parameter overload.
expectNotAssignable<CreateIndexesOptions>({ anOptionTheDriverDoesNotKnowAbout: true });

// `IndexDescription` picks its index options from `CreateIndexesOptions`, and `Pick` carries each
// property's doc comment along with it. `createIndexes` takes index options from
// `IndexDescription`, and `listIndexes` returns them on `IndexDescriptionInfo`, so a field-level
// deprecation on `CreateIndexesOptions` would wrongly mark them deprecated in both places.
declare const description: IndexDescription;
expectNotDeprecated(description.unique);
expectNotDeprecated(description.default_language);
expectNotDeprecated(description.expireAfterSeconds);
declare const listed: IndexDescriptionInfo;
expectNotDeprecated(listed.unique);
expectNotDeprecated(listed.default_language);
