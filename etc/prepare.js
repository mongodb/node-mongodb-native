#! /usr/bin/env node
var cp = require('child_process');
var fs = require('fs');

if (fs.existsSync('src')) {
  const result = cp.spawnSync('npm', ['run', 'build:dts'], { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    // We need devDependencies to build the driver
    cp.spawnSync('npm', ['install', '--ignore-scripts'], { stdio: 'inherit', shell: true });
    cp.spawnSync('npm', ['run', 'build:dts'], { stdio: 'inherit', shell: true });
  }
} else {
  if (!fs.existsSync('lib')) {
    console.warn('MongoDB: No compiled javascript present, the driver is not installed correctly.');
  }
}
