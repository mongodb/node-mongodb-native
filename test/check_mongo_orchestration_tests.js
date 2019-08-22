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
shell.exec('nohup mongo-orchestration start --no-daemon &');
shell.echo('finished starting mongo-orchestration');
shell.cd('mongo_orchestration');

shell.exec('../scripts/mo configurations/servers/clean.json start');
//shell.echo('trying to run mongo --port 27017:')
//shell.exec('mongo --port 27017')
//shell.exec('../scripts/mo configurations/servers/clean.json status');
shell.echo('finished check mongo orchestration script');
