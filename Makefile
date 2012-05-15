NODE = node
NPM = npm
NODEUNIT = node_modules/nodeunit/bin/nodeunit
DOX = node_modules/dox/bin/dox
name = all

total: build_native

build_native:
	# $(MAKE) -C ./external-libs/bson all

build_native_debug:
	$(MAKE) -C ./external-libs/bson all_debug

build_native_clang:
	$(MAKE) -C ./external-libs/bson clang

build_native_clang_debug:
	$(MAKE) -C ./external-libs/bson clang_debug

clean_native:
	$(MAKE) -C ./external-libs/bson clean

test: build_native
	@echo "\n == Run All tests minus replicaset tests=="
	$(NODE) dev/tools/test_all.js --noreplicaset --boot

test_pure: build_native
	@echo "\n == Run All tests minus replicaset tests=="
	$(NODE) dev/tools/test_all.js --noreplicaset --boot --nonative

test_junit: build_native
	@echo "\n == Run All tests minus replicaset tests=="
	$(NODE) dev/tools/test_all.js --junit --noreplicaset

test_nodeunit_pure:
	@echo "\n == Execute Test Suite using Pure JS BSON Parser == "
	@$(NODEUNIT) test/ test/gridstore test/bson

test_js:
	@$(NODEUNIT) $(TESTS)

test_nodeunit_replicaset_pure:
	@echo "\n == Execute Test Suite using Pure JS BSON Parser == "
	@$(NODEUNIT) test/replicaset

test_nodeunit_native:
	@echo "\n == Execute Test Suite using Native BSON Parser == "
	@TEST_NATIVE=TRUE $(NODEUNIT) test/ test/gridstore test/bson	

test_nodeunit_replicaset_native:
	@echo "\n == Execute Test Suite using Native BSON Parser == "
	@TEST_NATIVE=TRUE $(NODEUNIT) test/replicaset

test_all: build_native
	@echo "\n == Run All tests =="
	$(NODE) dev/tools/test_all.js --boot

test_all_junit: build_native
	@echo "\n == Run All tests =="
	$(NODE) dev/tools/test_all.js --junit --boot

clean:
	rm ./external-libs/bson/bson.node
	rm -r ./external-libs/bson/build

generate_docs:
	$(NODE) dev/tools/build-docs.js
	make --directory=./docs/sphinx-docs --file=Makefile html

.PHONY: total
