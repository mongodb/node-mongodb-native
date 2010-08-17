
NODE = node
name = all

total: build_native test_all

build_native:
	$(MAKE) -C ./external-libs/bson
	
test:
	@$(NODE) spec/spec.node.js
	
test_all: test integrate_test_all
	
integrate_test:
	@$(NODE) integration/integration_tests.js pure $(name)
	
integrate_test_all:
	@$(NODE) integration/integration_tests.js pure $(name)
	@$(NODE) integration/integration_tests.js native $(name)
	
.PHONY: total