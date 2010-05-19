
NODE = node
name = all

test:
	@$(NODE) spec/spec.node.js
	
test_all: test integrate_test
	
integrate_test:
	@$(NODE) integration/integration_tests.js
	
integrate:
	@$(NODE) integration/integration_tests2.js $(name)
	
.PHONY: test