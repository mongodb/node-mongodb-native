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
shell.cd('mongo_orchestration');
shell.cd('configurations');
shell.exec('mkdir /home/travis/tmp/');
shell.exec('../../scripts/mo servers/clean.json start');
