
NODE = node

test:
	@$(NODE) spec/spec.node.js
	
integrate_test:
	@$(NODE) integration/integration_tests.js
	
.PHONY: test