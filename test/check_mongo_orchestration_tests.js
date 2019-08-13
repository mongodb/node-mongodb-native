#!/bin/bash
const shell = require('shelljs');
if (!shell.which('mongo-orchestration')) {
  echo('Warning: please install mongo-orchestration.');
}
else {
  shell.echo('Path to Mongo-Orchestration:');
  shell.echo(shell.which('mongo-orchestration'));
}
