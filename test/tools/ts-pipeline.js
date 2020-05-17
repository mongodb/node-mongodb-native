'use strict';
const fs = require('fs');
const path = require('path');
const gulp = require('gulp');
const ts = require('gulp-typescript');
const prettier = require('gulp-prettier');
const through = require('through2');

function preserveNewlines() {
  return through.obj(function(file, encoding, callback) {
    const data = file.contents.toString('utf8');
    const fixedUp = data.replace(/\n\n/g, '\n/** THIS_IS_A_NEWLINE **/');
    file.contents = Buffer.from(fixedUp, 'utf8');
    callback(null, file);
  });
}

function restoreNewlines() {
  return through.obj(function(file, encoding, callback) {
    const data = file.contents.toString('utf8');
    const fixedUp = data.replace(/\/\*\* THIS_IS_A_NEWLINE \*\*\//g, '\n');
    file.contents = Buffer.from(fixedUp, 'utf8');
    callback(null, file);
  });
}

const tsConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../../tsconfig.json')));
const prettierConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.prettierrc')));

gulp.task('default', function() {
  return gulp
    .src('../../src/**/*.ts')
    .pipe(preserveNewlines())
    .pipe(ts(tsConfig.compilerOptions))
    .pipe(restoreNewlines())
    .pipe(prettier(prettierConfig))
    .pipe(gulp.dest('../../lib'));
});
