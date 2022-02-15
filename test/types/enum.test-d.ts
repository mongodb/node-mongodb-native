/* eslint-disable @typescript-eslint/no-unused-vars */
import { expectType } from 'tsd';

import {
  AuthMechanism,
  AutoEncryptionLoggerLevel,
  BatchType,
  BSONType,
  Compressor,
  CURSOR_FLAGS,
  CursorFlag,
  ExplainVerbosity,
  // GSSAPICanonicalizationValues,
  LoggerLevel,
  ProfilingLevel,
  ReadConcernLevel,
  ReadPreferenceMode,
  ReturnDocument,
  ServerApiVersion,
  ServerType,
  TopologyType
} from '../../src/index';

// In our index.ts we clump CURSOR_FLAGS with the enums but its an array
expectType<CursorFlag>(CURSOR_FLAGS[0]);

// Note both the Enum name and a property on the enum are the same type
// Object.values(x)[0] gets a union of the all the value types
expectType<AuthMechanism>(Object.values(AuthMechanism)[0]);
expectType<AutoEncryptionLoggerLevel>(Object.values(AutoEncryptionLoggerLevel)[0]);
expectType<BatchType>(Object.values(BatchType)[0]);
expectType<BSONType>(Object.values(BSONType)[0]);
expectType<Compressor>(Object.values(Compressor)[0]);
expectType<ExplainVerbosity>(Object.values(ExplainVerbosity)[0]);
// expectType<GSSAPICanonicalizationValues>(Object.values(GSSAPICanonicalizationValues)[0]);
expectType<LoggerLevel>(Object.values(LoggerLevel)[0]);
expectType<ProfilingLevel>(Object.values(ProfilingLevel)[0]);
expectType<ReadConcernLevel>(Object.values(ReadConcernLevel)[0]);
expectType<ReadPreferenceMode>(Object.values(ReadPreferenceMode)[0]);
expectType<ReturnDocument>(Object.values(ReturnDocument)[0]);
expectType<ServerApiVersion>(Object.values(ServerApiVersion)[0]);
expectType<ServerType>(Object.values(ServerType)[0]);
expectType<TopologyType>(Object.values(TopologyType)[0]);
