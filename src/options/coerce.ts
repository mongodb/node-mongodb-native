import { CoerceError, CoerceDeprecate, CoerceUnrecognized } from './coerce_error';

type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never

export type Func = (...args: any[]) => any;
export type Funcs = Func[];
export type ReturnTypes<T extends Funcs> = ReturnType<T[number]>;
export type StripCoerceError<T> = Exclude<T, CoerceError>;
export type CoerceType<F extends Func> = StripCoerceError<ReturnType<F>>;

export type CoerceMatch = ReturnType<typeof CoerceObject['match']>;
export type CoerceObjectMatch = (match: CoerceMatch) => any;
export type CoerceObjectMatches = CoerceObjectMatch[];

export type CoerceMatchExact = ReturnType<typeof CoerceObject['matchExact']>;
export type CoerceObjectMatchExact = (match: CoerceMatchExact) => any;
export type CoerceObjectMatchesExact = CoerceObjectMatch[];

export type ReturnTypeUnion<T extends Funcs> = UnionToIntersection<ReturnTypes<T>>;
export interface CoerceOptions {
  id?: string,
  warn?: boolean,
  typeSuffix?: string,
  warnDeprecated?: boolean,
  warnUnrecognized?: boolean,
  applyDefaults?: boolean
}
export type Coercer<T> = (value: any, options?: CoerceOptions) => T | CoerceError;

/** Coerces nested objects into a given shape using primitive coerce functions */
export class CoerceObject {
  static matchExact<V extends { [key: string]: any }>(value: V, key: keyof V, options?: CoerceOptions) {
    return <K extends string, F extends Coercer<any>>(
      matchKey: K,
      fn: F
    ): CoerceError extends ReturnType<F>
      ? Partial<Record<K, Exclude<ReturnType<F>, CoerceError>>>
      : Record<K, Exclude<ReturnType<F>, CoerceError>> => {
      if (key !== matchKey) return {} as any;
      const propValue = value[key];
      const result = fn(propValue, { ...options, id: key as string });
      if (result instanceof CoerceError) return {} as any;
      return { [matchKey]: result } as any;
    };
  }
  static match<V extends { [key: string]: any }>(
    value: V,
    key: keyof V,
    keyLower: string,
    options?: CoerceOptions
  ) {
    return <K extends string, F extends Coercer<any>>(
      matchKey: K,
      fn: F
    ): CoerceError extends ReturnType<F>
      ? Partial<Record<K, Exclude<ReturnType<F>, CoerceError>>>
      : Record<K, Exclude<ReturnType<F>, CoerceError>> => {
      if (keyLower !== matchKey.toLowerCase()) return {} as any;
      const propValue = value[key];
      const result = fn(propValue, { ...options, id: key as string });
      if (result instanceof CoerceError) return {} as any;
      return { [matchKey]: result } as any;
    };
  }
  static requireMatch<V extends { [key: string]: any }>(value: V) {
    return <K extends string, F extends Coercer<any>>(matchKey: K, fn: F) => {
      fn(value[matchKey], { id: matchKey, warn: false });
    };
  }
  static defaultMatch<K extends string, F extends Coercer<any>>(
    matchKey: K,
    fn: F
  ): CoerceError extends ReturnType<F>
    ? Partial<Record<K, Exclude<ReturnType<F>, CoerceError>>>
    : Record<K, Exclude<ReturnType<F>, CoerceError>> {
    try {
      const result = fn(undefined, { id: matchKey, warn: false });
      if (result instanceof CoerceError) return {} as any;
      return { [matchKey]: result } as any;
    } catch (e) {
      return {} as any;
    }
  }
  static gatherMatch<K extends string>(matchKey: K) {
    return { [matchKey]: true } as any;
  }
  static objectExact<F extends CoerceObjectMatchesExact>(...cbs: F) {
    return <V extends { [key: string]: any }>(
      value: V,
      options?: CoerceOptions
    ): ReturnTypeUnion<F> | CoerceError => {
      if (value === null || value === undefined) {
        return new CoerceError('object', value, options);
      }
      const results = Object.keys(value).reduce((acq: any, key: keyof V) => {
        const match = CoerceObject.matchExact(value, key, options);
        const collected = cbs.reduce((acq, cb) => {
          return { ...acq, ...cb(match) };
        }, {});
        return { ...acq, ...collected };
      }, {});
      // fire errors for required options
      cbs.map(cb => cb(CoerceObject.requireMatch(results) as any));
      // warn unrecognized properties
      if (options?.warn && options?.warnUnrecognized) {
        const data = cbs.reduce((acq, cb) => {
          return { ...acq, ...cb(CoerceObject.gatherMatch as any) };
        }, {});
        const recognizedKeys = Object.keys(data);
        const providedKeys = Object.keys(value);
        const unrecognized = providedKeys.filter(pk => !recognizedKeys.includes(pk));
        unrecognized.forEach(key => new CoerceUnrecognized(key).warn());
      }
      // set defaults
      if (options?.applyDefaults === undefined || options?.applyDefaults === true) {
        const defaultValues = cbs.reduce((acq, cb) => {
          return { ...acq, ...cb(CoerceObject.defaultMatch as any) };
        }, {});
        return { ...defaultValues, ...results };
      }
      return results;
    };
  }
  static object<F extends CoerceObjectMatches>(...cbs: F) {
    return <V extends { [key: string]: any }>(
      value: V,
      options?: CoerceOptions
    ): ReturnTypeUnion<F> | CoerceError => {
      if (value === null || value === undefined) {
        return new CoerceError('object', value, options);
      }
      const results = Object.keys(value).reduce((acq: any, key: keyof V) => {
        const keyLower = (key as string).toLowerCase();
        const match = CoerceObject.match(value, key, keyLower, options);
        const collected = cbs.reduce((acq, cb) => {
          return { ...acq, ...cb(match) };
        }, {});
        return { ...acq, ...collected };
      }, {});
      // fire errors for required options
      cbs.map(cb => cb(CoerceObject.requireMatch(results) as any));
      // warn unrecognized properties
      if (options?.warn && options?.warnUnrecognized) {
        const data = cbs.reduce((acq, cb) => {
          return { ...acq, ...cb(CoerceObject.gatherMatch as any) };
        }, {});
        const recognizedKeys = Object.keys(data);
        const recognizedKeysLc = recognizedKeys.map(v => v.toLowerCase());
        const providedKeys = Object.keys(value);
        const unrecognized = providedKeys.filter(pk => {
          return !(recognizedKeys.includes(pk) || recognizedKeysLc.includes(pk.toLowerCase()));
        });
        unrecognized.forEach(key => new CoerceUnrecognized(key).warn());
      }
      // set defaults
      if (options?.applyDefaults === undefined || options?.applyDefaults === true) {
        const defaultValues = cbs.reduce((acq, cb) => {
          return { ...acq, ...cb(CoerceObject.defaultMatch as any) };
        }, {});
        return { ...defaultValues, ...results };
      }
      return results;
    };
  }
}

/** Coerces values, acts as a type guard. Validates and transforms values. */
export class Coerce {
  // FUNCTIONAL UTILITIES
  /** wraps function and enables warning error */
  static warn<F extends Coercer<any>>(fn: F) {
    return (value: any, options?: CoerceOptions): ReturnType<F> => {
      const warnDeprecated = typeof options?.warnDeprecated === 'undefined' ? true : options?.warnDeprecated;
      const warnUnrecognized = typeof options?.warnUnrecognized === 'undefined' ? true : options?.warnUnrecognized;
      const warn = typeof options?.warn === 'undefined' ? true : options?.warn;
      const result = fn(value, { ...options, warn, warnDeprecated, warnUnrecognized });
      return result;
    };
  }
  /** wraps function and provides default if applicable */
  static default<F extends Coercer<any>>(fn: F, defaultValue: ReturnType<F>) {
    return (value: Parameters<F>[0] = defaultValue, options?: CoerceOptions): CoerceType<F> => {
      return fn(value, options);
    };
  }
  /** wraps function and warns deprecation notice if applicable */
  static deprecate<F extends Coercer<any>>(fn: F, favor?: string) {
    return (value: any, options?: CoerceOptions): ReturnType<F> => {
      if (options?.warn !== false && options?.warnDeprecated === true) {
        if (options?.id) new CoerceDeprecate(options?.id, favor).warn();
      }
      const result = fn(value, options);
      return result;
    };
  }
  /** wraps function and throws if invalid value */
  static require<F extends Coercer<any>>(fn: F) {
    return (value: Parameters<F>[0], options?: CoerceOptions): CoerceType<F> => {
      const result = fn(value, options);
      if (result instanceof CoerceError) throw result;
      return result;
    };
  }
  /** warps function and returns bool if it's valid false if it's a CoerceError */
  static validate<F extends Coercer<any>>(fn: F) {
    return (value: Parameters<F>[0], options?: CoerceOptions): Boolean => {
      const result = fn(value, options);
      if (result instanceof CoerceError) return false;
      return true;
    };
  }

  // PRIMITIVE TYPES

  /** will coerce value to a boolean */
  static boolean(value: any, options?: CoerceOptions): boolean | CoerceError {
    if (Array.isArray(value)) return this.boolean(value[value.length - 1], options);
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return new CoerceError('boolean', value, options);
  }
  /** will coerce value to a string */
  static string(value: any, options?: CoerceOptions): string | CoerceError {
    if (Array.isArray(value)) return this.string(value[value.length - 1], options);
    if (typeof value === 'string') return value;
    return new CoerceError('string', value, options);
  }
  /** will coerce value to a number */
  static number(value: any, options?: CoerceOptions): number | CoerceError {
    if (Array.isArray(value)) return this.number(value[value.length - 1], options);
    if (typeof value === 'number') return value;
    if (parseInt(value)) return parseInt(value);
    return new CoerceError('number', value, options);
  }
  /** will coerce value to a node compatible buffer */
  static buffer(value: any, options?: CoerceOptions): Buffer | CoerceError {
    if (Buffer.isBuffer(value)) return value;
    return new CoerceError('buffer', value, options);
  }
  /** will coerce value to a function */
  static function(value: any, options?: CoerceOptions): Function | CoerceError {
    if (typeof value === 'function') return value;
    return new CoerceError('function', value, options);
  }
  /** will match value to null */
  static null(value: any, options?: CoerceOptions): null | CoerceError {
    if (value === null) return value;
    return new CoerceError('null', value, options);
  }
  /** will match value to null */
  static any<T>(value: T, options?: CoerceOptions): T {
    return value;
  }
  static isPlainObject = Coerce.validate(Coerce.plainObject);
  /** will coerce value to ensure it's a plainObject */
  static plainObject(
    value: any,
    options?: CoerceOptions
  ): { [key: string]: any } | CoerceError {
    const is = (value: any) => {
      if (Object.prototype.toString.call(value) !== '[object Object]') return false;
      const prototype = Object.getPrototypeOf(value);
      return prototype === null || prototype === Object.prototype;
    };
    if (is(value)) return value;
    return new CoerceError('plainObject', value, options);
  }
  /** will coerce value to ensure it's an array of tags */
  static tags(value: any, options?: CoerceOptions): string[] | CoerceError {
    if (typeof value === 'string') return value.split(',');
    if (Array.isArray(value)) return value;
    if (Coerce.isPlainObject(value)) {
      return Object.keys(value).reduce((acq: string[], key: string) => {
        const val = value[key];
        const result = Coerce.string(val, { ...options, typeSuffix: 'tag value'});
        if (!(result instanceof CoerceError)) {
          return [...acq, `${key}:${result}`];
        }
        return acq;
      }, []);
    }
    return new CoerceError('tags', value, options);
  }
  /** will that value loosely matchings given value  */
  static given<V>(exact: V) {
    return (value: any, options?: CoerceOptions) => {
      if (typeof exact === 'string' && typeof value === 'string') {
        if (exact.toLowerCase() === value.toLowerCase()) return exact;
      }
      if (value === exact) return value;
      return new CoerceError(`exact ${CoerceError.displayValue(exact)}`, value, options);
    };
  }
  /** will that value is exactly matching given value  */
  static givenExact<V>(given: V) {
    return (value: any, options?: CoerceOptions) => {
      if (value === given) return value;
      return new CoerceError(`exact ${CoerceError.displayValue(given)}`, value, options);
    };
  }
  /** will coerce case-insensitive string to a enum */
  static enum<E>(e: { [name: string]: E }) {
    const inner = (value: any, options?: CoerceOptions): keyof E | CoerceError => {
      if (Array.isArray(value)) return inner(value[value.length - 1], options);
      const name = Object.keys(e)[0];
      const dict = Object.values(e)[0];
      const iterate = Object.values(dict);
      if (typeof value === 'string') {
        const lcValue = value.toLowerCase();
        const result = iterate.reduce((prev, current) => {
          if (typeof prev !== 'undefined') return prev;
          if (current.toLowerCase() === lcValue) return current;
          return prev;
        }, undefined);
        if (typeof result !== 'undefined') return result as keyof E;
      }
      return new CoerceError(`enum ${name}`, value, options);
    };
    return inner;
  }
  /** will coerce case-sensitive string to a enum */
  static enumExact<E>(e: { [name: string]: E }) {
    const inner = (value: any, options?: CoerceOptions): keyof E | CoerceError => {
      if (Array.isArray(value)) return inner(value[value.length - 1], options);
      const name = Object.keys(e)[0];
      const dict = Object.values(e)[0];
      if (typeof value === 'string') {
        if (Object.values(dict).includes(value)) return value as keyof E;
      }
      return new CoerceError(`enum ${name}`, value, options);
    };
    return inner;
  }
  /** will coerce array to a type passed in */
  static array<F extends Coercer<any>>(fn: F) {
    const inner = (value: any, options?: CoerceOptions): CoerceType<F>[] => {
      if (!Array.isArray(value)) return inner([value], options);
      const results = value.reduce((acq: any[], item: any) => {
        const result = fn(item, { ...options, typeSuffix: 'array'});
        if (result instanceof CoerceError) return acq;
        return [...acq, result];
      }, []);
      return results;
    };
    return inner;
  }
  /** will merge several types to form one coercer */
  static union<FS extends Coercer<any>[]>(...fns: FS) {
    return (value: any, options?: CoerceOptions): ReturnTypes<FS> | CoerceError => {
      const types: string[] = [];
      const DEFAULT = Symbol('DEFAULT');
      const result: any = fns.reduce((acq: any, fn: Func) => {
        if (acq !== DEFAULT) return acq;
        const result = fn(value, options);
        if (!(result instanceof CoerceError)) return result;
        if (result.typeName) types.push(result.typeName);
        return acq;
      }, DEFAULT);
      if (result !== DEFAULT) return result;
      return new CoerceError(`union (${types.join(' | ')})`, value, options);
    };
  }
  /** will coerce object to a set of properties */
  static object = CoerceObject.object;
  /** will coerce array to a type passed in */
  static objectExact = CoerceObject.objectExact;
}
