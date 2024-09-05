export type PropExists<Type, Key extends string> = Key extends keyof Type ? true : false;

// https://stackoverflow.com/questions/57683303/how-can-i-see-the-full-expanded-contract-of-a-typescript-type
/**
 * Expands object types one level deep
 *
 * Need help decoding a complex type?
 * Pass into Expand(Recursively) and you'll get the concrete answer in intellisense
 * try below, and hover over x in VScode
 *
 * @example
 * ```typescript
 * let x: ExpandRecursively<NotAcceptedFields<{ a: number; b: string; c: string }, number>>;
 * ```
 */
export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

// expands object types recursively
export type ExpandRecursively<T> =
  T extends Record<string, unknown>
    ? T extends infer O
      ? { [K in keyof O]: ExpandRecursively<O[K]> }
      : never
    : T;
