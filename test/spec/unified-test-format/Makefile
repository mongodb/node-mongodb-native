SCHEMA=../schema-1.20.json

.PHONY: all invalid valid-fail valid-pass atlas-data-lake versioned-api load-balancers gridfs transactions transactions-convenient-api crud collection-management read-write-concern retryable-reads retryable-writes sessions command-logging-and-monitoring client-side-operations-timeout HAS_AJV

all: invalid valid-fail valid-pass atlas-data-lake versioned-api load-balancers gridfs transactions transactions-convenient-api change-streams crud collection-management read-write-concern retryable-reads retryable-writes sessions command-logging-and-monitoring client-side-operations-timeout client-side-encryption

invalid: HAS_AJV
	@# Redirect stdout to hide expected validation errors
	@ajv test -s $(SCHEMA) -d "invalid/*.yml" --invalid > /dev/null && echo "invalid/*.yml passed test"

valid-fail: HAS_AJV
	@ajv test -s $(SCHEMA) -d "valid-fail/*.yml" --valid

valid-pass: HAS_AJV
	@ajv test -s $(SCHEMA) -d "valid-pass/*.yml" --valid

atlas-data-lake: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../atlas-data-lake-testing/tests/unified/*.yml" --valid

versioned-api: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../versioned-api/tests/*.yml" --valid

load-balancers: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../load-balancers/tests/*.yml" --valid

gridfs: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../gridfs/tests/*.yml" --valid

transactions: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../transactions/tests/unified/*.yml" --valid

transactions-convenient-api: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../transactions-convenient-api/tests/unified/*.yml" --valid

change-streams: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../change-streams/tests/unified/*.yml" --valid

client-side-operations-timeout: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../client-side-operations-timeout/tests/*.yml" --valid

crud: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../crud/tests/unified/*.yml" --valid

collection-management: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../collection-management/tests/*.yml" --valid

read-write-concern: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../read-write-concern/tests/operation/*.yml" --valid

retryable-reads: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../retryable-reads/tests/unified/*.yml" --valid

retryable-writes: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../retryable-writes/tests/unified/*.yml" --valid

sessions: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../sessions/tests/*.yml" --valid

command-logging-and-monitoring: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../command-logging-and-monitoring/tests/logging/*.yml" --valid
	@ajv test -s $(SCHEMA) -d "../../command-logging-and-monitoring/tests/monitoring/*.yml" --valid

client-side-encryption: HAS_AJV
	@ajv test -s $(SCHEMA) -d "../../client-side-encryption/tests/unified/*.yml" --valid

HAS_AJV:
	@if ! command -v ajv > /dev/null; then                \
	    echo 'Error: need "npm install -g ajv-cli"' 1>&2; \
	    exit 1;                                           \
	fi
