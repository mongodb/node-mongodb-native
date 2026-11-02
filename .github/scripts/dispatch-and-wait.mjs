// @ts-check
// TODO(NODE-7570): replace with workflow_call once GitHub/npm resolve the OIDC
// workflow_ref mismatch (https://github.com/npm/documentation/issues/1755).
//
// Dispatch a workflow_dispatch-triggered GitHub Actions workflow and wait for
// the resulting run to complete (propagating its exit status).
//
// `gh workflow run` prints the created workflow run URL on stdout when the
// server returns it (current github.com API version does); we parse the run
// id out of the URL and pass it to `gh run watch`.
//
// Usage:
//   node dispatch-and-wait.mjs <workflow.yml> [key=value ...]
//
//   For npm-publish.yml specifically:
//   node dispatch-and-wait.mjs npm-publish.yml tag=<tag> version=<v> ref=<sha>
//
// Arguments:
//   <workflow.yml>    Filename of the target workflow under .github/workflows/
//                     in the same repo. Must declare `on: workflow_dispatch:`.
//   key=value ...     Inputs forwarded to the dispatched workflow. Valid keys
//                     and which of them are required are determined by the
//                     target workflow's `on.workflow_dispatch.inputs`; the
//                     dispatch fails if any required input is missing or any
//                     unknown input is passed. For `npm-publish.yml`, all of
//                     `tag`, `version`, and `ref` are required.
//                     Example: tag=nightly version=1.2.3 ref=abc1234
//
// Environment:
//   GH_TOKEN              (required) used by the gh CLI; in a workflow set
//                         this to ${{ github.token }}.
//   DISPATCH_WORKFLOW_REF (optional, default `main`) git ref the target
//                         workflow file is loaded from. Hardcoded to main by
//                         default so callers on backport branches don't have
//                         to keep a copy of the target workflow on their
//                         branch.
import * as child_process from 'node:child_process';
import * as process from 'node:process';

const [, , workflow, ...inputArgs] = process.argv;
if (!workflow) {
  console.error('usage: dispatch-and-wait.mjs <workflow.yml> [key=value ...]');
  process.exit(2);
}

const dispatchRef = process.env.DISPATCH_WORKFLOW_REF || 'main';

const ghArgs = [
  'workflow', 'run', workflow,
  '--ref', dispatchRef,
  ...inputArgs.flatMap(kv => ['-f', kv])
];
console.log(`Dispatching ${workflow} from ref ${dispatchRef}`);

const dispatch = child_process.spawnSync('gh', ghArgs, {
  encoding: 'utf8',
  stdio: ['inherit', 'pipe', 'inherit']
});
if (dispatch.status !== 0) process.exit(dispatch.status ?? 1);

// gh prints e.g. "https://github.com/owner/repo/actions/runs/<id>"
const match = dispatch.stdout.match(/\/actions\/runs\/(\d+)/);
if (!match) {
  console.error('Could not extract run id from gh workflow run output:', dispatch.stdout);
  process.exit(1);
}
const runId = match[1];
console.log(`Dispatched run ${runId}`);

const watch = child_process.spawnSync('gh', ['run', 'watch', runId, '--exit-status'], {
  stdio: 'inherit'
});
process.exit(watch.status ?? 1);
