// The `import type` lines below are completely erased by the TypeScript compiler
// (no blank-line placeholder is left behind), so the compiled JS has fewer lines
// than this source file — every statement after them shifts upward in the JS
// output. Closing that gap is exactly what `--enable-source-maps` does: V8 must
// map the runtime JS line back to the original TypeScript line in THIS file.
import { readFileSync } from 'fs';

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

const PROBE_MESSAGE = 'source-map probe';
// The error is constructed on the line below; `probeSiteLine()` locates it at runtime.
const errorAtKnownLine = new Error(PROBE_MESSAGE);

/**
 * Capture a raw V8 stack frame by temporarily removing
 * `@cspotcode/source-map-support`'s prepareStackTrace override (installed by
 * ts-node) so we see exactly what V8 reports — with or without its own
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

/**
 * The TypeScript source line where `errorAtKnownLine` is constructed, read from
 * this file at runtime so the assertion can't drift when lines are added or
 * removed above. The needle is assembled from fragments so this lookup line does
 * not match itself.
 */
function probeSiteLine(): number {
  const needle = 'new Error(' + 'PROBE_MESSAGE)';
  const lines = readFileSync(__filename, 'utf8').split('\n');
  const index = lines.findIndex(line => line.includes(needle));
  if (index < 0) throw new Error(`could not locate the source-map probe site in ${__filename}`);
  return index + 1; // stack traces are 1-based
}

describe('Source maps', function () {
  it('report the correct line number when enabled', function () {
    const expectedLine = probeSiteLine();
    const frame = rawV8FrameOf(errorAtKnownLine);

    if (process.env.VERBOSE) {
      console.error('\n  ── raw V8 frame (prepareStackTrace bypassed) ──');
      console.error(`  file : ${frame.file}`);
      console.error(`  line : ${frame.line}  (TypeScript source line is ${expectedLine})`);
      console.error(`  col  : ${frame.col}`);
      console.error(
        `  ${frame.line === expectedLine ? '✔ line matches TS source' : `✘ line ${frame.line} ≠ TS source line ${expectedLine} — source maps not applied by V8`}`
      );
    }

    expect(frame.line).to.equal(
      expectedLine,
      `V8 reported line ${frame.line} but the TypeScript source line is ${expectedLine}. ` +
        `This means --enable-source-maps is absent and V8 is reading the compiled-JS ` +
        `line number instead of the original TypeScript line.`
    );
  });
});
