import { expectAssignable, expectType } from 'tsd';

import {
  AuthMechanism,
  AutoEncryptionLoggerLevel,
  BatchType,
  BSONType,
  Compressor,
  CURSOR_FLAGS,
  type CursorFlag,
  ExplainVerbosity,
  GSSAPICanonicalizationValue,
  MongoErrorLabel,
  ProfilingLevel,
  ReadConcernLevel,
  ReadPreferenceMode,
  ReturnDocument,
  ServerApiVersion,
  ServerType,
  TopologyType
} from '../mongodb';

const num: number = Math.random();

// In our index.ts we clump CURSOR_FLAGS with the enums but its an array
expectType<CursorFlag>(CURSOR_FLAGS[num]);

// Explain is kept as type string so we can automatically allow any new level to be passed through
expectAssignable<string>(Object.values(ExplainVerbosity)[num]);

// Note both the Enum name and a property on the enum are the same type
// Object.values(x)[num] gets a union of the all the value types
expectType<AuthMechanism>(Object.values(AuthMechanism)[num]);
expectType<AutoEncryptionLoggerLevel>(Object.values(AutoEncryptionLoggerLevel)[num]);
expectType<BatchType>(Object.values(BatchType)[num]);
expectType<BSONType>(Object.values(BSONType)[num]);
expectType<Compressor>(Object.values(Compressor)[num]);
expectType<GSSAPICanonicalizationValue>(Object.values(GSSAPICanonicalizationValue)[num]);
expectType<ProfilingLevel>(Object.values(ProfilingLevel)[num]);
expectType<ReadConcernLevel>(Object.values(ReadConcernLevel)[num]);
expectType<ReadPreferenceMode>(Object.values(ReadPreferenceMode)[num]);
expectType<ReturnDocument>(Object.values(ReturnDocument)[num]);
expectType<ServerApiVersion>(Object.values(ServerApiVersion)[num]);
expectType<ServerType>(Object.values(ServerType)[num]);
expectType<TopologyType>(Object.values(TopologyType)[num]);
expectType<MongoErrorLabel>(Object.values(MongoErrorLabel)[num]);
