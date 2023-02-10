const scopes = [
  'browser-repl',
  'browser-runtime-electron',
  'cli-repl',
  'connectivity-tests',
  'mongosh',
  'node-runtime-worker-thread',
  'service-provider-server'
];

const mongoshTestTasks = scopes.map(packageName => {
  return {
    name: `run-mongosh-${packageName}`,
    tags: ['run-mongosh-integration-tests'],
    depends_on: 'compile-mongosh',
    commands: [
      {
        func: 'install dependencies',
        vars: {
          NODE_LTS_NAME: 'gallium'
        }
      },
      {
        func: 'run mongosh tests for package',
        vars: {
          mongosh_package: packageName
        }
      }
    ]
  };
});

const compileTask = {
  name: `compile-mongosh`,
  tags: ['run-mongosh-integration-tests'],
  commands: [
    {
      func: 'install dependencies',
      vars: {
        NODE_LTS_NAME: 'gallium'
      }
    },
    { func: 'compile mongosh' }
  ]
};

const scopeVerificationTask = {
  name: `verify-mongosh-scopes`,
  tags: ['run-mongosh-integration-tests'],
  commands: [
    {
      func: 'install dependencies',
      vars: {
        NODE_LTS_NAME: 'gallium'
      }
    },
    { func: 'run mongosh package scope test' }
  ]
};

const tasks = [...mongoshTestTasks, compileTask, scopeVerificationTask];

module.exports = {
  mongoshTasks: tasks
};
