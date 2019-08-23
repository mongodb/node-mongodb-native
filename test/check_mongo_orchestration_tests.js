'use strict';
const shell = require('shelljs');
if (!shell.test('-e', 'mongo-orchestration')) {
  shell.echo('Mongo-orchestration not found. Installing mongo-orchestration.');
  shell.exec('git clone https://github.com/10gen/mongo-orchestration.git');
  shell.cd('mongo-orchestration');
  shell.exec('pip install . --user');
} else {
  shell.cd('mongo-orchestration');
}
shell.exec('nohup mongo-orchestration start &');
shell.echo('finished starting mongo-orchestration');
shell.cd('mongo_orchestration');
shell.echo('mongodb environment variable is: ')
shell.exec('echo $MONGODB_ENVIRONMENT');
if (process.env.MONGODB_ENVIRONMENT === 'standalone') {
  shell.exec('../scripts/mo configurations/servers/clean.json start');
}
else if (process.env.MONGODB_ENVIRONMENT === 'replicaset') {
  shell.exec('../scripts/mo configurations/replica_sets/clean.json start');
}
else if (process.env.MONGODB_ENVIRONMENT === 'sharded') {
  shell.exec('../scripts/mo configurations/sharded_clusters/clean.json start');
}
else {
  shell.echo('mongodb environment error. Do not recognize $MONGODB_ENVIRONMENT');
}
shell.echo('finished check mongo orchestration script');
