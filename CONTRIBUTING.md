# Contributing

When contributing to this repository, please first discuss the change you wish
to make via issue, pull request, or any other method with the owners of this
repository before making a change.

Please note we have a [code of conduct][code-of-conduct],
please follow it in all your interactions with the project.

## Developer Startup Guide

### Runtime

It's recommended you install Node Version Manager for [unix systems][nvm-unix] or [windows][nvm-windows]. While it isn't required we have a minimum node version requirement (look in package.json under the "engines" key) and we can't accept code that does not work on the minimum specified version.

### MongoDB Helpers

- To get various MongoDB topologies up and running easily you can use the python based tool [mtools][mtools-install].
- To get various versions of MongoDB to test against you can use [m](https://github.com/aheckmann/m) an npm tool best installed globally `npm i -g m`.

### VSCode Setup

If you are developing in VSCode here's some suggestions:
We have an example of our workspace file: save this as `mongodbNodeDriver.code-workspace` and replace PATH_TO_DRIVER with the path to the driver repository on your computer.

<details>
<summary>mongodbNodeDriver.code-workspace</summary>
<br>
<pre lang="jsonc">
{
  "folders": [
    {
      "path": "PATH_TO_DRIVER",
      "name": "driver"
    }
  ],
  "settings": {
    "search.exclude": {
      // I always set 'file to include' in search to:
      // - src
      // - test
      // - {test|src}
      "**/node_modules": false, // searching node_modules comes in handy
      "./lib": true, // by default I don't want results from our compiled source
      "**/bower_components": true,
      "**/*.code-search": true
    },
    // ts gives me the power to not rely on word matching
    "editor.wordBasedSuggestions": false,
    "gitlens.hovers.enabled": false,
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": true
    },
    "[javascript]": {
      "editor.defaultFormatter": "dbaeumer.vscode-eslint"
    },
    "[typescript]": {
      "editor.defaultFormatter": "dbaeumer.vscode-eslint",
      "editor.codeActionsOnSave": {
        "source.organizeImports": false
      }
    },
    "eslint.enable": true,
    "eslint.format.enable": true,
    "mochaExplorer.files": "test/{functional,unit}/**/*.test.js",
    "mochaExplorer.ui": "test/tools/runner/metadata_ui.js",
    "editor.formatOnSave": false,
    "editor.rulers": [100],
    "editor.renderWhitespace": "selection",
    "files.trimTrailingWhitespace": true,
    "files.trimFinalNewlines": true,
    "files.insertFinalNewline": true,
    "typescript.tsdk": "node_modules/typescript/lib",
    // I leave the coverage extension disabled when not using it so I leave these commented
    // but these settings are nice when it is enabled
    // "coverage-gutters.showGutterCoverage": false,
    // "coverage-gutters.showLineCoverage": true,
  },
  "launch": {
    "configurations": [
      {
        // Sometimes I need to run mocha myself and not via the sidebar
        // Here I can add custom args or env variables
        "name": "run mocha",
        "type": "pwa-node",
        "request": "launch",
        "program": "node_modules/.bin/mocha",
        "args": ["test/unit", "test/functional"]
      }
    ],
    "compounds": []
  },
  "tasks": {
    "version": "2.0.0",
    "tasks": [
      {
        // Here is an optional watcher task (`npm test` will also type check you changes):
        // Since this is the default build task it can be started with cmd+shift+b
        // There will be a wrench and screw icon
        // on the bottom bar where you can quick check build issues
        "label": "watch TS",
        "command": "npx",
        "type": "shell",
        "args": ["tsc", "-w"],
        "problemMatcher": "$tsc-watch",
        "isBackground": true,
        "group": {
          "kind": "build",
          "isDefault": true
        }
      }
    ]
  },
  "extensions": {
    "recommendations": [
      "dbaeumer.vscode-eslint",
      "hbenl.vscode-test-explorer",
      "hbenl.vscode-mocha-test-adapter",
      "ryanluker.vscode-coverage-gutters",
      "github.vscode-pull-request-github",
      "mongodb.mongodb-vscode"
    ],
    "unwantedRecommendations": ["esbenp.prettier-vscode"]
  }
}
</pre>
</details>

If you use this file you will get our recommended extensions suggested to you.
If not, we recommend picking up `dbaeumer.vscode-eslint` at least to make sure any additional code is following style recommendations. If you don't want to use this workspace file but still don't want to think about formatting you can have VSCode do the checks and formatting work for you by adding just these settings:

```jsonc
"settings":{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "[javascript]": {
    "editor.defaultFormatter": "dbaeumer.vscode-eslint"
  },
  "[typescript]": {
    "editor.defaultFormatter": "dbaeumer.vscode-eslint",
  }
}
```

### Running the tests

Running the tests:

- You can use the script: `test/tools/cluster_setup.sh server`
- If you are running against more than a standalone make sure your ulimit settings are in accordance with mongo's recommendations
  - Changing the settings on the latest versions of [macos can be tricky read here][macos-ulimt] (unless you know you need it you shouldn't have to do the complicated maxproc steps)
- Prefix the cluster_setup.sh script with `env MONGODB_VERSION=X.Y` to test against a specific version of the server
- `env MONGODB_URI=mongodb://localhost:27017 npm test`
- When testing different topologies you may need to remove the existing data folder created.
- To run a single test, use `npm run test -- -g 'test name'`
  - If it's easier you can also isolate tests by adding .only. Example: `it.only(‘cool test’, {})`
- To test only the unified topology, use `env MONGODB_UNIFIED_TOPOLOGY=1`

### Commit messages

Please follow the [Angular commit style][angular-commit-style].
The format should look something like this (note the blank lines):

```txt
<type>(<scope>): <subject>

<body>

NODE-XXXX
```

If there is a relevant NODE ticket number it should be in the footer section of the Angular style commit.

This helps the team automate [HISTORY.md](HISTORY.md) generation.
These are the commit types we make use of:

- **feat:** A new feature
- **fix:** A bug fix
- **docs:** Documentation only changes
- **style:** Changes that do not affect the meaning of the code (e.g, formatting)
- **refactor:** A code change that neither fixes a bug nor adds a feature
- **perf:** A code change that improves performance
- **test:** Adding missing or correcting existing tests
- **chore:** Changes to the build process or auxiliary tools and libraries such as documentation generation

## Conventions Guide

Below are some conventions that aren't enforced by any of our tooling but we nonetheless do our best to adhere to:

- **Disallow `async / await` syntax**
  - There is a measurable overhead to Promise usage vs simple callbacks. To support the broadest of driver usage scenarios we maintain an internal callback api while exposing a surface layer Promise API.
- **Disallow `export default` syntax**
  - For our use case it is best if all imports / exports remain named.
- **As of 4.0 all code in src is in Typescript**
  - Typescript provides a nice developer experience. As a product of using TS we should be using es6 syntax features whenever possible.
- **Errors**
  - Error messages should be sentence case, and have no periods at the end.
  - Use built-in error types where possible (not just Error, but TypeError/RangeError), also endeavor to create new Mongo-specific error types (e.g. MongoNetworkError)

## Pull Request Process

1. Update the README.md or similar documentation with details of changes you
   wish to make, if applicable.
2. Add any appropriate tests.
3. Make your code or other changes.
4. Review guidelines such as [How to write the perfect pull request][github-perfect-pr], thanks!

Take a look at [Github Flow][github-flow] for a more detailed explanation of this process.

[angular-commit-style]: https://github.com/angular/angular.js/blob/master/DEVELOPERS.md#commits
[changelog]: CHANGELOG.md
[code-of-conduct]: CODE_OF_CONDUCT.md
[github-perfect-pr]: https://blog.github.com/2015-01-21-how-to-write-the-perfect-pull-request/
[mdb-core-values]: https://www.mongodb.com/company/
[mtools-install]: http://blog.rueckstiess.com/mtools/install.html
[nvm-windows]: https://github.com/coreybutler/nvm-windows#installation--upgrades
[nvm-unix]: https://github.com/nvm-sh/nvm#install--update-script
[macos-ulimt]: https://wilsonmar.github.io/maximum-limits/
[github-flow]: https://guides.github.com/introduction/flow/
