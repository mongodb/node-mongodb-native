AWS Lambda Testing
------------------

Running locally
===============

Prerequisites:

- AWS SAM CLI
- Docker daemon running

Steps
=====

- `sam build` from the `test/lambda`.

- `sam local invoke --parameter-overrides "MongoDbUri=mongodb://127.0.0.1:27017"`
