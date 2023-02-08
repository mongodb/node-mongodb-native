#!/bin/bash
cd ${DRIVERS_TOOLS}/.evergreen/auth_oidc
. ./activate_venv.sh

# Install mongosh
curl https://github.com/mongodb-js/mongosh/releases/download/v1.6.2/mongodb-mongosh-shared-openssl3-1.6.2.x86_64.rpm --output mongosh.rpm

ls -la

sudo yum -y install mongosh.rpm

mongosh setup_oidc.js
