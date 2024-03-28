import { ByteUtils } from '../../../utils';

/**
 * @internal
 * StringFinder is declared as a class so we can delete/test the cache
 */
export class StringFinder {
  private static cache: Record<string, Uint8Array> = Object.create(null);

  /**
   * Given a js string, determine if the element has that name in the BSON sequence.
   *
   * @remarks
   * - Assumes basic latin strings only!
   * - Caches the transformation of JS string to bytes for faster lookups
   */
  public static includes(bytes: Uint8Array, name: string, at: number): boolean {
    if (this.cache[name] == null) {
      this.cache[name] = Uint8Array.from(name, c => c.charCodeAt(0));
    }
    return ByteUtils.includes(bytes, at, this.cache[name]);
  }
}
