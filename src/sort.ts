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
function prepareDirection(direction: any = 1): SortDirectionForCmd {
  const value = ('' + direction).toLowerCase();
  if (isMeta(direction)) return direction;
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

/** @internal */
function isMeta(t: SortDirection): t is { $meta: string } {
  return typeof t === 'object' && t !== null && '$meta' in t && typeof t.$meta === 'string';
}

/** @internal */
function isPair(t: Sort): t is [string, SortDirection] {
  if (Array.isArray(t) && t.length === 2) {
    try {
      prepareDirection(t[1]);
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

/** @internal */
function pairToObject(v: [string, SortDirection]): SortForCmd {
  return { [v[0]]: prepareDirection(v[1]) };
}

/** @internal */
function isDeep(t: Sort): t is [string, SortDirection][] {
  return Array.isArray(t) && Array.isArray(t[0]);
}

/** @internal */
function deepToObject(t: [string, SortDirection][]): SortForCmd {
  const sortObject: SortForCmd = {};
  for (const [name, value] of t) {
    sortObject[name] = prepareDirection(value);
  }
  return sortObject;
}

/** @internal */
function stringsToObject(t: string[]): SortForCmd {
  const sortObject: SortForCmd = {};
  for (const key of t) {
    sortObject[key] = 1;
  }
  return sortObject;
}

/** @internal */
function objectToObject(t: { [key: string]: SortDirection }): SortForCmd {
  const sortObject: SortForCmd = {};
  for (const key in t) {
    sortObject[key] = prepareDirection(t[key]);
  }
  return sortObject;
}

/** converts a Sort type into a type that is valid for the server (SortForCmd) */
export function formatSort(
  sort: Sort | undefined,
  direction?: SortDirection
): SortForCmd | undefined {
  if (sort == null) return undefined;
  if (Array.isArray(sort) && !sort.length) return undefined;
  if (typeof sort === 'object' && !Object.keys(sort).length) return undefined;
  if (typeof sort === 'string') return { [sort]: prepareDirection(direction) };
  if (isPair(sort)) return pairToObject(sort);
  if (isDeep(sort)) return deepToObject(sort);
  if (Array.isArray(sort)) return stringsToObject(sort);
  if (typeof sort === 'object') return objectToObject(sort);
  throw new Error(`Invalid sort format: ${JSON.stringify(sort)}`);
}
