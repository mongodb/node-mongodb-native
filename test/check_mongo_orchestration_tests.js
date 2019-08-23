'use strict';
const shell = require('shelljs');
shell.echo('mongodb environment variable is: ')
shell.exec('echo $MONGODB_ENVIRONMENT');
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

shell.exec('../scripts/mo configurations/servers/clean.json start');
shell.echo('finished check mongo orchestration script');
