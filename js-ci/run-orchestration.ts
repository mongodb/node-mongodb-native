import { exec } from 'child_process';
import { readFile, rm } from 'fs/promises';
import { resolve } from 'path';
import { promisify } from 'util';

import { spawn, stdout } from './utils.ts';

const __dirname = import.meta.dirname;
const DRIVERS_TOOLS = resolve(__dirname, '../drivers-evergreen-tools');

interface OrchestrationArguments {
  auth?: boolean;
  ssl?: 'ssl' | 'nossl';
  topology: 'replica_set' | 'server' | 'sharded_cluster';
  version: string;
}

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

async function installNode(
  env: NodeJS.ProcessEnv,
  target: `${number}` | `v${number}.${number}.${number}` | `${number}.${number}.${number}`
): Promise<NodeJS.ProcessEnv> {
  const NODE_ARTIFACTS_PATH = resolve(process.cwd(), '../node_artifacts');
  await rm(NODE_ARTIFACTS_PATH, { recursive: true });
  const npm_global_prefix = resolve(NODE_ARTIFACTS_PATH, 'npm_global');
  const script = resolve(DRIVERS_TOOLS, '.evergreen/install-node.sh');
  await spawn(
    `bash ${script}`,
    { ...env, NODE_LTS_VERSION: target, NODE_ARTIFACTS_PATH, npm_global_prefix },
    'INSTALL_NODE'
  );

  const path = env.PATH ?? '';
  return {
    ...env,
    NODE_LTS_VERSION: target,
    NODE_ARTIFACTS_PATH,
    PATH: `${NODE_ARTIFACTS_PATH}/nodejs/bin:${path}`
  };
}

export async function runOrchestration(env: NodeJS.ProcessEnv, args: OrchestrationArguments) {
  const script = resolve(DRIVERS_TOOLS, '.evergreen/run-orchestration.sh');
  const updatedEnv: NodeJS.ProcessEnv = {
    ...env,
    MONGODB_VERSION: args.version,
    TOPOLOGY: args.topology,
    AUTH: args.auth ? 'AUTH' : 'NOAUTH',
    SSL: args.ssl ? 'ssl' : 'nossl',
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

export function runTests(env: NodeJS.ProcessEnv) {
  const script = resolve(__dirname, '../.evergreen/run-tests.sh');

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
  env = await installNode(env, '22.2.0');
  env = await testNodeEnv(env);
  env = await runOrchestration(env, {
    topology: 'replica_set',
    auth: true,
    version: 'latest'
  });

  await runTests(env);
}

main();
