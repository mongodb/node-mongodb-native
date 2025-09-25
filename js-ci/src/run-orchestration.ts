import { exec } from 'child_process';
import { readFile, rm, stat } from 'fs/promises';
import { resolve } from 'path';
import { promisify } from 'util';

import { spawn, stdout } from './utils';

const DRIVERS_TOOLS = resolve(__dirname, '../../drivers-evergreen-tools');

async function killMongoOrchestration() {
  const output = await promisify(exec)(`lsof -i tcp:8889`, { encoding: 'utf-8' }).then(
    ({ stdout }) => stdout,
    () => ''
  );
  const pid_regex = /(?<pid>\d{5})/;

  for (const pid of output
    .split('\n')
    .map(line => line.match(pid_regex)?.groups?.port)
    .filter(Boolean)) {
    stdout.writeln(`killing ${pid}`);
    await promisify(exec)(`kill ${pid}`);
  }
}

async function installNode(env: NodeJS.ProcessEnv): Promise<NodeJS.ProcessEnv> {
  const NODE_ARTIFACTS_PATH = resolve(process.cwd(), '../node_artifacts');
  const exists = (path: string) =>
    stat(path).then(
      () => true,
      () => false
    );
  (await exists(NODE_ARTIFACTS_PATH)) && (await rm(NODE_ARTIFACTS_PATH, { recursive: true }));
  const npm_global_prefix = resolve(NODE_ARTIFACTS_PATH, 'npm_global');
  const script = resolve(DRIVERS_TOOLS, '.evergreen/install-node.sh');
  await spawn(`bash ${script}`, { ...env, NODE_ARTIFACTS_PATH, npm_global_prefix }, 'INSTALL_NODE');

  const path = env.PATH ?? '';
  return {
    ...env,
    NODE_ARTIFACTS_PATH,
    PATH: `${NODE_ARTIFACTS_PATH}/nodejs/bin:${path}`
  };
}

export async function runOrchestration(
  env: NodeJS.ProcessEnv
): Promise<NodeJS.ProcessEnv & { DRIVERS_TOOLS: string }> {
  const script = resolve(DRIVERS_TOOLS, '.evergreen/run-orchestration.sh');
  const updatedEnv: NodeJS.ProcessEnv & { DRIVERS_TOOLS: string } = {
    ...env,
    DRIVERS_TOOLS
  };

  if (env.MONGODB_URI) {
    stdout.writeln(`MONGODB_URI exists.  skipping mongo-orchestration...`);
    return updatedEnv;
  }
  killMongoOrchestration();

  async function parseOrchestrationOutput(): Promise<NodeJS.ProcessEnv> {
    const orchestrationOutput = await readFile('mo-expansion.yml', 'utf-8');
    return Object.fromEntries(
      orchestrationOutput
        .split('\n')
        .map(line => /(?<KEY>.+): "(?<VALUE>.+)"/.exec(line)?.groups)
        .filter((v): v is { KEY: string; VALUE: string } => Boolean(v))
        .map(({ KEY, VALUE }) => [KEY, VALUE])
    );
  }

  await spawn(`bash ${script}`, updatedEnv, 'RUN_ORCHESTRATION');

  return {
    ...updatedEnv,
    ...(await parseOrchestrationOutput())
  };
}

async function testNodeEnv(env: NodeJS.ProcessEnv) {
  await spawn(`node --version`, env, 'NODE_VERSION');
  await spawn(`which node`, env, 'NODE_VERSION');
  await spawn(`npm --version`, env, 'NODE_VERSION');
  await spawn(`which npm`, env, 'NODE_VERSION');

  return env;
}

export function runTests<T extends NodeJS.ProcessEnv & { DRIVERS_TOOLS: string }>(env: T) {
  const script = resolve(__dirname, '../../.evergreen/run-tests.sh');

  const resolvedEnv: NodeJS.ProcessEnv = { ...env };
  if (!['true', 'false'].includes(resolvedEnv.CLIENT_ENCRYPTION ?? '')) {
    throw new Error(`the CLIENT_ENCRYPTION environment variable must be set.`);
  }

  if (resolvedEnv.SSL) {
    resolvedEnv.SSL_KEY_FILE = resolve(env.DRIVERS_TOOLS, '.evergreen/x509gen/client.pem');
    resolvedEnv.SSL_KEY_FILE = resolve(env.DRIVERS_TOOLS, '.evergreen/x509gen/ca.pem');
  }

  stdout.writeln(
    `Running ${resolvedEnv.AUTH} tests over ${resolvedEnv.SSL}, connecting to ${resolvedEnv.MONGODB_URI}`
  );
  process.chdir('..');

  spawn(`bash ${script}`, {
    ...env,
    CLIENT_ENCRYPTION: 'false'
  });
}

async function main() {
  let env: NodeJS.ProcessEnv = { ...process.env };
  env = await installNode(env);
  env = await testNodeEnv(env);
  const env2 = await runOrchestration(env);

  await runTests(env2);
}

main();
