import { MongoError } from './error';

interface OptionalModule {
  kModuleError: MongoError;
}

export function optionalRequire<T>(moduleName: string): T | OptionalModule {
  try {
    return require(moduleName);
  } catch {
    return { kModuleError: new MongoError(`Optional Module ${moduleName} not found`) };
  }
}
