import * as gulp from 'gulp';
import { promisify } from 'util';
import { exec } from 'child_process';
import { writeFileSync, readdirSync, unlinkSync } from 'fs';
import { basename } from 'path';
import * as ts from 'gulp-typescript';

import tsConfig = require('./tsconfig.json');
const run = promisify(exec);

gulp.task('typedoc', async () => {
  function generateTypeDocConfig() {
    const tutorials = readdirSync('docs/reference/content/tutorials')
      .filter(filename => filename.endsWith('.md'))
      .map(filename => `docs/reference/content/tutorials/${filename}`);

    const docOptions = {
      entryPoint: 'types/mongodb.d.ts',
      mode: 'file',
      out: 'docs/gen',
      theme: 'pages-plugin',
      excludeNotExported: true,
      stripInternal: true,
      pages: {
        enableSearch: true,
        listInvalidSymbolLinks: true,
        output: 'pages',
        groups: [
          {
            title: 'Documentation',
            pages: [
              {
                title: 'FAQ',
                source: 'docs/reference/content/reference/faq/index.md'
              }
            ]
          },
          {
            title: 'Tutorials',
            pages: [
              {
                title: 'Quick Start',
                source: 'docs/reference/content/quick-start/quick-start.md',
                children: tutorials.map(filepath => ({
                  title: basename(filepath).replace('.md', ''),
                  source: filepath
                }))
              }
            ]
          }
        ]
      }
    };

    return docOptions;
  }

  const docOptions = generateTypeDocConfig();

  writeFileSync('./typedoc.json', JSON.stringify(docOptions, undefined, 2), {
    encoding: 'utf8'
  });

  try {
    await run('npx typedoc');
  } catch (err) {
    console.error('typedoc encountered an error:');
    console.error((err.stdout as string).trim());
    console.error((err.stderr as string).trim());
    console.error('typedoc settings:');
    console.error(JSON.stringify(docOptions, undefined, 2));
  } finally {
    unlinkSync('./typedoc.json');
  }
});

gulp.task('api-extractor', async () => {
  try {
    const { stdout, stderr } = await run('npx api-extractor run --local --verbose');
    console.log(stdout);
    console.log(stderr);
    await run('npx rimraf lib/*.d.ts lib/**/*.d.ts');
    await run('npx prettier types/mongodb.d.ts --write');
  } catch (err) {
    console.error('encountered an error:');
    console.error((err.stdout as string).trim());
    console.error((err.stderr as string).trim());
  }
});

gulp.task('compile', () => {
  try {
    return gulp.src('./src/**/*.ts').pipe(ts(tsConfig.compilerOptions)).pipe(gulp.dest('./lib'));
  } catch (err) {
    console.error('encountered an error:');
    console.error((err.stdout as string).trim());
    console.error((err.stderr as string).trim());
  }
});

gulp.task('definition', gulp.series('compile', 'api-extractor'));
gulp.task('doc', gulp.series('definition', 'typedoc'));

gulp.task('default', gulp.series('compile', 'api-extractor', 'typedoc'));
