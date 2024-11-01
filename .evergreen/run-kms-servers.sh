#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail

source ./activate-kms-venv.sh

echo "Python version information"
echo "which python?: ${which python}"
echo "python -v: ${python -v}"

python -u kms_http_server.py --ca_file ../x509gen/ca.pem --cert_file ../x509gen/expired.pem --port 8000 &
python -u kms_http_server.py --ca_file ../x509gen/ca.pem --cert_file ../x509gen/wrong-host.pem --port 8001 &
python -u kms_http_server.py --ca_file ../x509gen/ca.pem --cert_file ../x509gen/server.pem --port 8002 --require_client_cert &
