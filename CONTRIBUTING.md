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
- Read further in [test/readme.md](test/readme.md) if you need to test a special environment like CSFLE, or Serverless.

### Tests FAQ

- How can I run the tests against more than a standalone?
  - You can use the `test/tools/cluster_setup.sh replica_set`
  - You can prefix the npm test with a MONGODB_URI environment variable to point the tests to the correct deployment
    - `env MONGODB_URI=mongodb://localhost:27017 npm test`
  - If you are running against more than a standalone make sure your ulimit settings are in accordance with mongo's recommendations
  - Changing the settings on the latest versions of macos can be tricky: [read here][macos-ulimt] (unless you know you need it you shouldn't have to do the complicated maxproc steps)
- How can I run just one test?
  - To run a single test, use mocha's grep flag: `npm run test -- -g 'test name'`
  - If it's easier you can also isolate tests by adding `.only` Example: `it.only(‘cool test’, function() {})`

### Commit messages

Please follow the [conventional commit style][conventional-commit-style].
The format should look something like this (note the blank lines):

```txt
<type>(<scope>): <subject>

<body>
```

If there is a relevant NODE ticket number it should be referenced in the scope portion of the commit.

Note that a BREAKING CHANGE commit should include an exclamation mark after the scope, for example:

```text
feat(NODE-xxxx)!: created new version api, removed support for old version
```

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
1. Please adhere to the guidelines in [How to write the perfect pull request][github-perfect-pr], thanks!
1. Please perform a self-review using the reviewer guidelines below prior to taking the PR out of draft state.

### Reviewer Guidelines

Reviewers should use the following questions to evaluate the implementation for correctness/completeness and ensure all housekeeping items have been addressed prior to merging the code.

- Correctness/completeness
  1. Do you fully understand the implementation? (Would you be comfortable explaining how this code works to someone else?)
  1. Does the code meet the acceptance criteria?
     - If there is an associated spec, does the code match the spec?
  1. Is the intention of the code captured in relevant tests?
     - Does the description of each test accurately represent the assertions?
     - For any test explicitly called out on the ticket as desirable to implement, was it implemented?
     - If there are prose spec tests, were they implemented?
     - If there are associated automated spec tests, were they all pulled in and are they all running and correctly interpreting the spec inputs?
       - Are any runner changes needed to process new input types?
  1. Could these changes impact any adjacent functionality?
  1. Are there any errors that might not be correctly caught or propagated?
  1. Is there anything that could impact performance?
  1. Are there any race conditions in the functional code or tests?
  1. Can you think of a better way to implement any of the functional code or tests? "Better" means any combination of:
     - more performant
     - better organized / easier to understand / clearer separation of concerns
     - easier to maintain (easier to change, harder to accidentally break)
- Housekeeping
  1. Does the title and description of the PR reference the correct jira ticket and does it use the correct conventional commit type (e.g., fix, feat, test, breaking change etc)?
     - If the change is breaking, ensure there is an exclamation mark after the scope (e.g., "fix(NODE-xxx)!: \<description\>" )
  1. If there are new TODOs, has a related JIRA ticket been created?
  1. Are symbols correctly marked as internal or public?
  1. Do the Typescript types match expected runtime usage? Are there tests for new or updated types?
  1. Should any documentation be updated?
     - Has the relevant internal documentation been updated as part of the PR?
     - Have the external documentation requirements been captured in jira?

[conventional-commit-style]: https://www.conventionalcommits.org/en/v1.0.0/
[code-of-conduct]: CODE_OF_CONDUCT.md
[github-perfect-pr]: https://blog.github.com/2015-01-21-how-to-write-the-perfect-pull-request/
[mdb-core-values]: https://www.mongodb.com/company/
[mtools-install]: http://blog.rueckstiess.com/mtools/install.html
[nvm-windows]: https://github.com/coreybutler/nvm-windows#installation--upgrades
[nvm-unix]: https://github.com/nvm-sh/nvm#install--update-script
[macos-ulimt]: https://wilsonmar.github.io/maximum-limits/
[workspace-file]: https://gist.githubusercontent.com/nbbeeken/d831a3801b4c463648c077b27da5057b/raw/8e986843e5e28019f7c0cebe5c6fa72407bf8afb/node-mongodb-native.code-workspace
