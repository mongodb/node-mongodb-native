import { expectType } from 'tsd';
import { BSONSerializeOptions, Document } from '../../src/bson';

const options: BSONSerializeOptions = {};

expectType<boolean | undefined>(options.checkKeys);
expectType<boolean | undefined>(options.serializeFunctions);
expectType<boolean | undefined>(options.ignoreUndefined);
expectType<boolean | undefined>(options.promoteLongs);
expectType<boolean | undefined>(options.promoteBuffers);
expectType<boolean | undefined>(options.promoteValues);
expectType<Document | undefined>(options.fieldsAsRaw);
expectType<boolean | undefined>(options.bsonRegExp);

type PermittedBSONOptionKeys =
  | 'checkKeys'
  | 'serializeFunctions'
  | 'ignoreUndefined'
  | 'promoteLongs'
  | 'promoteBuffers'
  | 'promoteValues'
  | 'bsonRegExp';

const keys = (null as unknown) as PermittedBSONOptionKeys;
// creates an explicit allow list assertion
expectType<keyof BSONSerializeOptions>(keys);
