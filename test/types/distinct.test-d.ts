import { expectType } from 'tsd';

import type { Collection } from '../../src/collection';
import type { Movie } from './example_schemas';

// Ensure distinct takes all keys of the schema plus '_id'
const x = (null as unknown) as Parameters<Collection<Movie>['distinct']>[0];
expectType<'_id' | keyof Movie>(x);
