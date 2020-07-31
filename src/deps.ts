import { MongoError } from './error';

interface ModuleNotFoundObject {
  kModuleError: MongoError;
}

export function optionalRequire<T>(moduleName: string): T | ModuleNotFoundObject {
  try {
    return require(moduleName);
  } catch {
    return { kModuleError: new MongoError(`Optional Module ${moduleName} not found`) };
  }
}
