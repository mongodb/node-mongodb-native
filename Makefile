NODE = node
NPM = npm
NODEUNIT = node_modules/nodeunit/bin/nodeunit
DOX = node_modules/dox/bin/dox
name = all

total: build_native

test:
	node test/runner.js -t functional

test_ssl:
	node test/runner.js -t ssl	

test_replicaset:
	node test/runner.js -t replicaset

test_sharded:
	node test/runner.js -t sharded

generate_docs:
	$(NODE) dev/tools/build-docs.js
	make --directory=./docs/sphinx-docs --file=Makefile html

.PHONY: total
