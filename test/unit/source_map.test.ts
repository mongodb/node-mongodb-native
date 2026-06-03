// These import-type lines are completely erased by the TypeScript compiler
// (no blank-line placeholder is left behind), so the compiled JS has fewer
// lines than this source file.  That shifts every subsequent line upward in
// the JS output.
import type { Document as _Doc } from 'bson';
import { expect } from 'chai';

import type {
  AbstractCursor as _AbC,
  AggregationCursor as _AC,
  ChangeStream as _CS,
  ClientSession as _Sess,
  Collection as _Col,
  Db as _Db,
  FindCursor as _FC,
  GridFSBucket as _GB,
  MongoClient as _MC
} from '../../mongodb';

// ─── This Error is created at line 31 in the TypeScript source. ───────────
// The twelve `import type` lines above are erased without replacement, so
// in the compiled JS this falls on line 31 − 12 = line 19.
//
// ts-node's bundled `@cspotcode/source-map-support` patches
// Error.prepareStackTrace so `error.stack` already shows the correct TS
// line. We DISABLE that patch to see what V8 reports natively.
//
//   OLD commit (no --enable-source-maps): V8 says line 19  ← WRONG
//   NEW commit (   --enable-source-maps): V8 says line 31  ← correct
const TS_SOURCE_LINE = 31; // must match the line below
const errorAtKnownLine = new Error('source-map probe'); // ← line 31

/**
 * Capture a raw V8 stack frame by temporarily removing
 * `@cspotcode/source-map-support`'s prepareStackTrace override (installed
 * by ts-node) so we see exactly what V8 reports — with or without its own
 * source-map awareness.
 */
function rawV8FrameOf(err: Error): {
  file: string | null;
  line: number | null;
  col: number | null;
} {
  const saved = Error.prepareStackTrace;
  // Null → V8 uses its built-in formatter (honours --enable-source-maps).
  Error.prepareStackTrace = undefined as unknown as typeof Error.prepareStackTrace;
  const raw = err.stack ?? ''; // triggers V8 formatting with no hook
  Error.prepareStackTrace = saved;

  // First "at …" line: "    at Object.<anonymous> (/abs/path/file.ts:LINE:COL)"
  const match = raw.split('\n')[1]?.match(/\((.+):(\d+):(\d+)\)$/);
  if (!match) return { file: null, line: null, col: null };
  return { file: match[1], line: Number(match[2]), col: Number(match[3]) };
}

describe('Source maps', function () {
  it('report the collect line number when enabled', function () {
    const frame = rawV8FrameOf(errorAtKnownLine);

    console.log('\n  ── raw V8 frame (prepareStackTrace bypassed) ──');
    console.log(`  file : ${frame.file}`);
    console.log(`  line : ${frame.line}  (TypeScript source line is ${TS_SOURCE_LINE})`);
    console.log(`  col  : ${frame.col}`);
    console.log(
      `  ${frame.line === TS_SOURCE_LINE ? '✔ line matches TS source' : `✘ line ${frame.line} ≠ TS source line ${TS_SOURCE_LINE} — source maps not applied by V8`}`
    );

    expect(frame.line).to.equal(
      TS_SOURCE_LINE,
      `V8 reported line ${frame.line} but TypeScript source line is ${TS_SOURCE_LINE}. ` +
      `This means --enable-source-maps is absent and V8 is reading the compiled-JS ` +
      `line number instead of the original TypeScript line.`
    );
  });
});
