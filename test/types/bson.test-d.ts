import { expectType } from 'tsd';

import type { BSONSerializeOptions, Document } from '../../src';

const options: BSONSerializeOptions = {};

expectType<boolean | undefined>(options.checkKeys);
expectType<boolean | undefined>(options.serializeFunctions);
expectType<boolean | undefined>(options.ignoreUndefined);
expectType<boolean | undefined>(options.useBigInt64);
expectType<boolean | undefined>(options.promoteLongs);
expectType<boolean | undefined>(options.promoteBuffers);
expectType<boolean | undefined>(options.promoteValues);
expectType<boolean | undefined>(options.bsonRegExp);
expectType<Document | undefined>(options.fieldsAsRaw);

type PermittedBSONOptionKeys =
  | 'checkKeys'
  | 'serializeFunctions'
  | 'ignoreUndefined'
  | 'useBigInt64'
  | 'promoteLongs'
  | 'promoteBuffers'
  | 'promoteValues'
  | 'bsonRegExp'
  | 'fieldsAsRaw'
  | 'enableUtf8Validation'
  | 'raw';

const keys = null as unknown as PermittedBSONOptionKeys;
// creates an explicit allow list assertion
expectType<keyof BSONSerializeOptions>(keys);
