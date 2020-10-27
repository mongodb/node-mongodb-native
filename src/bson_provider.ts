import * as BSON from './bson';

const kBSON = Symbol('BSON');

interface BSONStore {
  [kBSON]?: typeof BSON;
}

const store: BSONStore = {
  [kBSON]: undefined
};

/**
 * Global BSON store allowing user-provided BSONs
 * @public
 */
export class BSONProvider {
  /** Validates the passed in BSON library */
  static validate(lib: unknown): lib is typeof BSON {
    if (!(typeof lib === 'object' && lib !== null)) {
      throw new TypeError('BSON library is not an object');
    }
    if (!('Long' in lib)) {
      throw new TypeError('BSON library missing method "Long"');
    }
    if (!('Binary' in lib)) {
      throw new TypeError('BSON library missing method "Binary"');
    }
    if (!('ObjectId' in lib)) {
      throw new TypeError('BSON library missing method "ObjectId"');
    }
    if (!('Timestamp' in lib)) {
      throw new TypeError('BSON library missing method "Timestamp"');
    }
    if (!('Code' in lib)) {
      throw new TypeError('BSON library missing method "Code"');
    }
    if (!('MinKey' in lib)) {
      throw new TypeError('BSON library missing method "MinKey"');
    }
    if (!('MaxKey' in lib)) {
      throw new TypeError('BSON library missing method "MaxKey"');
    }
    if (!('Decimal128' in lib)) {
      throw new TypeError('BSON library missing method "Decimal128"');
    }
    if (!('Int32' in lib)) {
      throw new TypeError('BSON library missing method "Int32"');
    }
    if (!('Double' in lib)) {
      throw new TypeError('BSON library missing method "Double"');
    }
    if (!('DBRef' in lib)) {
      throw new TypeError('BSON library missing method "DBRef"');
    }
    if (!('deserialize' in lib)) {
      throw new TypeError('BSON library missing method "deserialize"');
    }
    if (!('serialize' in lib)) {
      throw new TypeError('BSON library missing method "serialize"');
    }
    if (!('calculateObjectSize' in lib)) {
      throw new TypeError('BSON library missing method "calculateObjectSize"');
    }
    return true;
  }

  /** Sets the BSON library */
  static set(lib: typeof BSON): void {
    if (!BSONProvider.validate(lib)) {
      // validate
      return;
    }
    store[kBSON] = lib;
  }

  /** Get the stored BSON library, or resolves passed in */
  static get(): typeof BSON {
    return store[kBSON] as typeof BSON;
  }
}

BSONProvider.set(BSON);
