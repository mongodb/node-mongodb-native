---
aliases:
- /doc/contributing/
- /meta/contributing/
date: 2013-07-01
menu:
  main:
    parent: community
next: /tutorials/github_pages_blog
prev: /community/press
title: Contributing
weight: 30
---

To contribute to the project *we encourage pull requests allowing for discussion of code changes.*

## Contributing

When you are ready to send us a pull request make sure you perform the following steps first.

  *  Ensure you have at least one test case that covers the new code. If you are wondering how to do this please feel free to ask in the pull request for help.
  *  Ensure you run the tests. `node test/runner.js -t functional`
  *  Squash all your commits into a single commit. `git rebase -i`. You can force update your pull request as history for it is not important for us to keep.

## Contribution Steps

1. Fork the Node.js driver from https://github.com/mongodb/node-mongodb-native
2. Create a new feature branch (`git checkout -b feature`)
3. Commit your changes using git (`git commit -a -m 'My changes'`)
4. Run tests suite (ensure mongodb is in path) (`node test/runner.js -t functional`)
5. Squash the commits (`git rebase -i`)
6. Push the new branch to your github fork (`git push origin feature`)
7. Create a new Pull Request on github.

# Running Tests

## Clone repository locally

    git clone https://github.com/mongodb/node-mongodb-native
    cd node-mongodb-native
    npm install

## Running The Test Suite

Make sure the *mongod* executable is in your shell or command line *path*. Then run the functional test suite.

    node test/runner.js -t functional

To run the replicaset test suite do

    node test/runner.js -t functional -e replicaset

To run the sharded test suite do

    node test/runner.js -t functional -e sharded