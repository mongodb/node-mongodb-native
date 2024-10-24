#!/bin/bash
set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

export K8S_DRIVERS_TAR_FILE=/tmp/node-mongodb-native.tgz
cd ..
tar -czf $K8S_DRIVERS_TAR_FILE src drivers-tools
cd -
bash $DRIVERS_TOOLS/.evergreen/auth_oidc/k8s/setup-pod.sh
bash $DRIVERS_TOOLS/.evergreen/auth_oidc/k8s/run-self-test.sh
export K8S_TEST_CMD="source ./env.sh && cd src && ENVIRONMENT=k8s ./.evergreen/${SCRIPT}"
source $DRIVERS_TOOLS/.evergreen/auth_oidc/k8s/secrets-export.sh
bash $DRIVERS_TOOLS/.evergreen/auth_oidc/k8s/run-driver-test.sh
bash $DRIVERS_TOOLS/.evergreen/auth_oidc/k8s/teardown-pod.sh