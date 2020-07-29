import type { Server } from '../../sdam/server';

export { killCursors } from './kill_cursors';
export { getMore } from './get_more';
export { query } from './query';
export { command } from './command';

import { writeCommand } from './write_command';
import type { Callback, Document } from '../../types';

export { writeCommand };

export interface InsertOptions {
  [key: string]: any;
}

export function insert(
  server: Server,
  ns: string,
  ops: Document[],
  options: InsertOptions,
  callback: Callback
): void {
  writeCommand(server, 'insert', 'documents', ns, ops, options, callback);
}

export interface UpdateOptions {
  [key: string]: any;
}

export function update(
  server: Server,
  ns: string,
  ops: Document[],
  options: UpdateOptions,
  callback: Callback
): void {
  writeCommand(server, 'update', 'updates', ns, ops, options, callback);
}

export interface RemoveOptions {
  [key: string]: any;
}

export function remove(
  server: Server,
  ns: string,
  ops: Document[],
  options: RemoveOptions,
  callback: Callback
): void {
  writeCommand(server, 'delete', 'deletes', ns, ops, options, callback);
}
