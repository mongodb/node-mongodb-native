import { expectType } from 'tsd';

import { type Document, MongoClient } from '../mongodb';

const client = new MongoClient('');
const admin = client.db().admin();

expectType<{
  databases: ({ name: string; sizeOnDisk?: number; empty?: boolean } & Document)[];
  totalSize?: number;
  totalSizeMb?: number;
  ok: 1 | 0;
}>(await admin.listDatabases());
