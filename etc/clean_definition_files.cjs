#! /usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
var fs = require('fs');
var path = require('path');

function* walk(root) {
  const directoryContents = fs.readdirSync(root);
  for (const filepath of directoryContents) {
    const fullPath = path.join(root, filepath);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      yield* walk(fullPath);
    } else if (stat.isFile()) {
      yield fullPath;
    }
  }
}

const libPath = path.resolve(__dirname, '..', 'lib');
if (fs.existsSync(libPath)) {
  const definitionFiles = Array.from(walk(libPath)).filter(filePath => {
    return filePath.endsWith('.d.ts') || filePath.endsWith('.d.ts.map');
  });
  for (const definitionFile of definitionFiles) {
    fs.unlinkSync(definitionFile);
  }
}
