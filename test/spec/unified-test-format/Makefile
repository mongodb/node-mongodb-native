SCHEMA=../schema-1.5.json

.PHONY: all invalid valid-fail valid-pass versioned-api load-balancers gridfs transactions crud collection-management sessions command-monitoring HAS_AJV

all: invalid valid-fail valid-pass versioned-api load-balancers gridfs transactions crud collection-management sessions command-monitoring

invalid: HAS_AJV
	@# Redirect stdout to hide expected validation errors
	@ajv test -s $(SCHEMA) -d "invalid/*.yml" --invalid > /dev/null && echo "invalid/*.yml passed test"

valid-fail: HAS_AJV
	@ajv test -s $(SCHEMA) -d "valid-fail/*.yml" --valid

valid-pass: HAS_AJV
	@ajv test -s $(SCHEMA) -d "valid-pass/*.yml" --valid

versioned-api: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../versioned-api/tests/*.yml" --valid

load-balancers: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../load-balancers/tests/*.yml" --valid

gridfs: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../gridfs/tests/*.yml" --valid

transactions: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../transactions/tests/unified/*.yml" --valid

crud: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../crud/tests/unified/*.yml" --valid

collection-management: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../collection-management/tests/*.yml" --valid

sessions: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../sessions/tests/unified/*.yml" --valid

command-monitoring: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../command-monitoring/tests/unified/*.yml" --valid

HAS_AJV:
	@if ! command -v ajv > /dev/null; then                \
	    echo 'Error: need "npm install -g ajv-cli"' 1>&2; \
	    exit 1;                                           \
	fi
