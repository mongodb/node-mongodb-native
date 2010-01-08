
NODE = node

test:
	@$(NODE) spec/spec.node.js
	
test_all: test integrate_test
	
integrate_test:
	@$(NODE) integration/integration_tests.js
	
.PHONY: test