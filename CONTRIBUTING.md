# Contributing

When contributing to this repository, please first discuss the change you wish
to make via issue, pull request, or any other method with the owners of this
repository before making a change.

Please note we have a [code of conduct][code-of-conduct],
please follow it in all your interactions with the project.

## Developer Startup Guide

### Runtime

It's recommended you install Node Version Manager for [unix systems][nvm-unix] or [windows][nvm-windows].
While it isn't required we have a minimum node version requirement (look in [package.json](./package.json) under the "engines" key) and we can't accept code that does not work on the minimum specified version.

### MongoDB Helpers

- For setting up a cluster to test against we recommend using [mtools][mtools-install].
- For managing installed versions of MongoDB, we recommend using [m](https://github.com/aheckmann/m).

### VSCode Setup

- Save the the workspace file [mongodbNodeDriver.code-workspace][workspace-file] next to where you have the driver cloned to and open this in VSCode.
Double check that the `folders.path` at the top of the file's json is correct.

- We recommended these extensions:
  - [eslint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
  - [test-explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer)
  - [mocha-test-adapter](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-mocha-test-adapter)
  - [coverage-gutters](https://marketplace.visualstudio.com/items?itemName=ryanluker.vscode-coverage-gutters)
  - [pull-request-github](https://marketplace.visualstudio.com/items?itemName=github.vscode-pull-request-github)
  - [mongodb](https://marketplace.visualstudio.com/items?itemName=mongodb.mongodb-vscode)
  - [gitlens](https://marketplace.visualstudio.com/items?itemName=eamodio.gitlens)

If you just want to get formatting and linting working automatically use these settings:

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

- Start a mongod standalone with our [cluster_setup.sh](test/tools/cluster_setup.sh) script
  - Usage: `./test/tools/cluster_setup.sh server`
- Run the tests with `npm test`

### Tests FAQ

- How can I run the tests against more than a standalone?
  - You can use the `test/tools/cluster_setup.sh replica_set`
  - You can prefix the npm test with a MONGODB_URI environment variable to point the tests to the correct deployment
    - `env MONGODB_URI=mongodb://localhost:27017 npm test`
  - If you are running against more than a standalone make sure your ulimit settings are in accordance with mongo's recommendations
  - Changing the settings on the latest versions of [macos can be tricky read here][macos-ulimt] (unless you know you need it you shouldn't have to do the complicated maxproc steps)
- How can I run just one test?
  - To run a single test, use mocha's grep flag: `npm run test -- -g 'test name'`
  - If it's easier you can also isolate tests by adding `.only` Example: `it.only(‘cool test’, function() {})`

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

- **Ensure Promise usage is optional**
  - There is a measurable overhead to Promise usage vs callbacks.
  To support the broadest of driver usage scenarios we maintain an internal callback api while exposing a surface layer Promise API.
- **Disallow `export default` syntax**
  - For our use case it is best if all imports / exports remain named.
- **As of 4.0 all code in src is in Typescript**
  - Typescript provides a nice developer experience
  As a product of using TS we should be using es6 syntax features whenever possible.
- **Errors**
  - Error messages should be sentence case, and have no periods at the end.
  - Use driver-specific error types where possible (not just `Error`, but classes that extend `MongoError`, e.g. `MongoNetworkError`)

## Pull Request Process

1. Update the README.md or similar documentation with details of changes you
   wish to make, if applicable.
1. Add any appropriate tests.
1. Make your code or other changes.
1. Review guidelines such as [How to write the perfect pull request][github-perfect-pr], thanks!

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
[workspace-file]: https://gist.githubusercontent.com/nbbeeken/d831a3801b4c463648c077b27da5057b/raw/8e986843e5e28019f7c0cebe5c6fa72407bf8afb/node-mongodb-native.code-workspace
