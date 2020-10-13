/** @public */
export type SortDirection =
  | 1
  | -1
  | 'asc'
  | 'desc'
  | 'ascending'
  | 'descending'
  | { $meta: string };

/** @public */
export type Sort =
  | string
  | string[]
  | { [key: string]: SortDirection }
  | [string, SortDirection][]
  | [string, SortDirection];

/** Below stricter types were created for sort that correspond with type that the cmd takes  */

/** @internal */
type SortDirectionForCmd = 1 | -1 | { $meta: string };

/** @internal */
type SortForCmd = { [key: string]: SortDirectionForCmd };

/** @internal */
class SortDigest {
  static prepareDirection(direction: any = 1): SortDirectionForCmd {
    const value = ('' + direction).toLowerCase();
    if (SortDigest.isMeta(direction)) return direction;
    switch (value) {
      case 'ascending':
      case 'asc':
      case '1':
        return 1;
      case 'descending':
      case 'desc':
      case '-1':
        return -1;
      default:
        throw new Error(`Invalid sort direction: ${JSON.stringify(direction)}`);
    }
  }
  static isMeta(t: SortDirection): t is { $meta: string } {
    return typeof t === 'object' && t !== null && '$meta' in t && typeof t.$meta === 'string';
  }
  static isPair(t: Sort): t is [string, SortDirection] {
    if (Array.isArray(t) && t.length === 2) {
      try {
        SortDigest.prepareDirection(t[1]);
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }
  static pairToObject(v: [string, SortDirection]): SortForCmd {
    return { [v[0]]: SortDigest.prepareDirection(v[1]) };
  }
  static isDeep(t: Sort): t is [string, SortDirection][] {
    return Array.isArray(t) && Array.isArray(t[0]);
  }
  static deepToObject(t: [string, SortDirection][]): SortForCmd {
    return t.reduce((acq, i) => {
      return { ...acq, ...SortDigest.pairToObject(i) };
    }, {});
  }
  static stringsToObject(t: string[]): SortForCmd {
    return t.reduce((acq, key) => {
      return { ...acq, [key]: 1 };
    }, {});
  }
  static validate(t: { [key: string]: SortDirection }): SortForCmd {
    return Object.keys(t).reduce((acq, key) => {
      return { ...acq, [key]: SortDigest.prepareDirection(t[key]) };
    }, {});
  }
  static prepare(sort: Sort | undefined, direction?: SortDirection): SortForCmd | undefined {
    if (sort == null) return undefined;
    if (Array.isArray(sort) && !sort.length) return undefined;
    if (typeof sort === 'object' && !Object.keys(sort).length) return undefined;
    if (typeof sort === 'string') return { [sort]: SortDigest.prepareDirection(direction) };
    if (SortDigest.isPair(sort)) return SortDigest.pairToObject(sort);
    if (SortDigest.isDeep(sort)) return SortDigest.deepToObject(sort);
    if (Array.isArray(sort)) return SortDigest.stringsToObject(sort);
    if (typeof sort === 'object') return SortDigest.validate(sort);
    throw new Error(`Invalid sort format: ${JSON.stringify(sort)}`);
  }
}

/** converts a Sort type into a type that is valid for the server (SortForCmd) */
export const formatSort = SortDigest.prepare;
