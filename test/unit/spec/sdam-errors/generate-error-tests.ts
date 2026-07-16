import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

// TypeScript port of the former generate-error-tests.py. These SDAM application-error
// tests are internally maintained (not synced from the specifications repo), so they live
// here under test/unit/spec/sdam-errors rather than in the vendored test/spec tree.
//
// Run with: npx ts-node test/unit/spec/sdam-errors/generate-error-tests.ts
//
// Unlike the Python version (which emitted YAML and relied on the specifications repo's
// `make` to convert to JSON), this script writes the final .json fixtures directly.

const DIR = __dirname;

const template = (filename: string): string => fs.readFileSync(path.join(DIR, filename), 'utf8');

/**
 * Re-implementation of Python's `str.format(**vars)` for named fields. The YAML templates
 * only use simple `{field}` placeholders (no literal `{{`/`}}` escapes), so a single pass
 * over named fields is sufficient.
 */
function format(tmpl: string, vars: Record<string, string | number>): string {
  return tmpl.replace(/\{(\w+)\}/g, (_match, name: string) => {
    if (!(name in vars)) {
      throw new Error(`template referenced unknown field: {${name}}`);
    }
    return String(vars[name]);
  });
}

function writeTest(filename: string, data: string): void {
  const fullpath = path.join(DIR, `${filename}.json`);
  const parsed = yaml.load(data);
  fs.writeFileSync(fullpath, `${JSON.stringify(parsed, null, 2)}\n`);
  console.log(`Generated ${fullpath}`);
}

// Maps from error_name to error_code
const ERR_CODES: Record<string, number> = {
  InterruptedAtShutdown: 11600,
  InterruptedDueToReplStateChange: 11602,
  NotPrimaryOrSecondary: 13436,
  PrimarySteppedDown: 189,
  ShutdownInProgress: 91,
  NotWritablePrimary: 10107,
  NotPrimaryNoSecondaryOk: 13435,
  LegacyNotPrimary: 10058
};

// On 4.2+, only ShutdownInProgress and InterruptedAtShutdown clear the pool.
const clearsPool = (errorName: string): 0 | 1 =>
  errorName === 'ShutdownInProgress' || errorName === 'InterruptedAtShutdown' ? 1 : 0;

function createStaleTests(): void {
  const tmp = template('stale-topologyVersion.yml.template');
  for (const [errorName, errorCode] of Object.entries(ERR_CODES)) {
    const testName = `stale-topologyVersion-${errorName}`;
    writeTest(testName, format(tmp, { error_name: errorName, error_code: errorCode }));
  }
}

const TV_GREATER = `
      topologyVersion:
        processId:
          "$oid": '000000000000000000000001'
        counter:
          "$numberLong": "2"`;
const TV_GREATER_FINAL = `
          processId:
            "$oid": '000000000000000000000001'
          counter:
            "$numberLong": "2"`;
const TV_CHANGED = `
      topologyVersion:
        processId:
          "$oid": '000000000000000000000002'
        counter:
          "$numberLong": "1"`;
const TV_CHANGED_FINAL = `
          processId:
            "$oid": '000000000000000000000002'
          counter:
            "$numberLong": "1"`;

// Maps non-stale error description to [error_topology_version, final_topology_version]
const NON_STALE_CASES: Record<string, [string, string]> = {
  'topologyVersion missing': ['', ' null'],
  'topologyVersion greater': [TV_GREATER, TV_GREATER_FINAL],
  'topologyVersion proccessId changed': [TV_CHANGED, TV_CHANGED_FINAL]
};

function createNonStaleTests(): void {
  const tmp = template('non-stale-topologyVersion.yml.template');
  for (const [errorName, errorCode] of Object.entries(ERR_CODES)) {
    for (const [description, [errorTV, finalTV]] of Object.entries(NON_STALE_CASES)) {
      const testName = `non-stale-${description.replace(/ /g, '-')}-${errorName}`;
      writeTest(
        testName,
        format(tmp, {
          error_name: errorName,
          error_code: errorCode,
          error_topology_version: errorTV,
          final_topology_version: finalTV,
          final_pool_generation: clearsPool(errorName)
        })
      );
    }
  }
}

const WHEN = ['beforeHandshakeCompletes', 'afterHandshakeCompletes'] as const;
const STALE_GENERATION_COMMAND_ERROR = `
    type: command
    response:
      ok: 0
      errmsg: {error_name}
      code: {error_code}
      topologyVersion:
        processId:
          "$oid": '000000000000000000000001'
        counter:
          "$numberLong": "2"`;
const STALE_GENERATION_NETWORK_ERROR = `
    type: {network_error_type}`;

function createStaleGenerationTests(): void {
  const tmp = template('stale-generation.yml.template');
  // Stale command errors
  for (const [errorName, errorCode] of Object.entries(ERR_CODES)) {
    for (const when of WHEN) {
      const testName = `stale-generation-${when}-${errorName}`;
      const staleError = format(STALE_GENERATION_COMMAND_ERROR, {
        error_name: errorName,
        error_code: errorCode
      });
      writeTest(
        testName,
        format(tmp, {
          error_name: errorName,
          error_code: errorCode,
          when,
          stale_error: staleError
        })
      );
    }
  }
  // Stale network errors
  for (const networkErrorType of ['network', 'timeout']) {
    for (const when of WHEN) {
      const testName = `stale-generation-${when}-${networkErrorType}`;
      const staleError = format(STALE_GENERATION_NETWORK_ERROR, {
        network_error_type: networkErrorType
      });
      writeTest(
        testName,
        format(tmp, {
          error_name: networkErrorType,
          network_error_type: networkErrorType,
          when,
          stale_error: staleError
        })
      );
    }
  }
}

function createPost42Tests(): void {
  const tmp = template('post-42.yml.template');
  for (const [errorName, errorCode] of Object.entries(ERR_CODES)) {
    writeTest(
      `post-42-${errorName}`,
      format(tmp, {
        error_name: errorName,
        error_code: errorCode,
        final_pool_generation: clearsPool(errorName)
      })
    );
  }
}

// NOTE: createPre42Tests (pre-42.yml.template) is intentionally not invoked. Those fixtures
// target maxWireVersion 8 (MongoDB 4.2), which is below the driver's minimum supported wire
// version, so they were pruned. The template is retained for history.

createStaleTests();
createNonStaleTests();
createStaleGenerationTests();
createPost42Tests();
