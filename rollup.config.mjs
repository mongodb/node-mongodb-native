import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

/** @type {typescript.RollupTypescriptOptions} */
const tsConfig = {
    "allowJs": true,
    "checkJs": false,
    "strict": true,
    "alwaysStrict": true,
    "target": "ES2021",
    "module": "esnext",
    "moduleResolution": "node",
    "skipLibCheck": true,
    "lib": [
      "es2021",
      "ES2022.Error",
      "ES2022.Object"
    ],
    // We don't make use of tslib helpers, all syntax used is supported by target engine
    "importHelpers": false,
    "noEmitHelpers": true,
    // Never emit error filled code
    "noEmitOnError": true,
    // We want the sourcemaps in a separate file
    "inlineSourceMap": false,
    "sourceMap": true,
    // outDir: 'lib',
    // we include sources in the release
    "inlineSources": false,
    // Prevents web types from being suggested by vscode.
    "types": [
      "node"
    ],
    tsconfig: false,
    "forceConsistentCasingInFileNames": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    // TODO(NODE-3659): Enable useUnknownInCatchVariables and add type assertions or remove unnecessary catch blocks
    "useUnknownInCatchVariables": false,
  include: ['src/**/*']
};
const input = 'src/index.ts';

/** @type {import('rollup').RollupOptions} */
const notBundled = [
  // {
  //   external: ['bson', '@mongodb-js/saslprep', 'mongodb-connection-string-url'],
  //   input,
  //   plugins: [typescript(tsConfig), nodeResolve({ resolveOnly: [] })],
  //   output: [
  //     {
  //       dir: 'lib/cjs',
  //       format: 'commonjs',
  //       exports: 'named',
  //       sourcemap: true,
  //       preserveModules: true
  //     },
  //   ]
  // },
  {
    external: ['bson', '@mongodb-js/saslprep', 'mongodb-connection-string-url'],
    input,
    plugins: [
      typescript(tsConfig),
      nodeResolve({ resolveOnly: [] })
    ],
    output: {
      dir: 'lib/esm',
      format: 'esm',
      sourcemap: true,
      preserveModules: true,
      entryFileNames: '[name].mjs'
    }
  }
];

/** @type {import('rollup').RollupOptions} */
const bundled = [
  // {
  //   external: ['bson', '@mongodb-js/saslprep', 'mongodb-connection-string-url'],
  //   input,
  //   plugins: [typescript(tsConfig), nodeResolve({ resolveOnly: [] })],
  //   output: [
  //     {
  //       file: 'lib/mongodb.cjs',
  //       format: 'commonjs',
  //       exports: 'named',
  //       sourcemap: true,
  //       // preserveModules: true
  //     },
  //   ]
  // },
  {
    external: ['bson', '@mongodb-js/saslprep', 'mongodb-connection-string-url'],
    input,
    plugins: [
      typescript(tsConfig),
      nodeResolve({ resolveOnly: [] })
    ],
    output: {
      file: 'lib/mongodb.mjs',
      format: 'esm',
      sourcemap: true,
      // preserveModules: true,
      // entryFileNames: '[name].mjs'
    }
  }
];

export default notBundled;
