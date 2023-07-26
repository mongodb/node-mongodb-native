This directory contains Data Encryption Key (DEKs) encrypted by various Key Encryption Keys (KEKs) for testing.

Files are named as follows:

- `<UUID>-key-material.txt` is the decrypted key material.
- `<UUID>-local-document.json` is a key document with "_id" of <UUID> encrypted with a local KEK.
- `<UUID>-aws-document.json` is a key document with "_id" of <UUID> encrypted with an AWS KEK.
- `<UUID>-aws-decrypt-reply.txt` is an HTTP reply from AWS KMS decrypting the DEK.

The key material of the local KEK 96 bytes of 0.

The `csfle` CLI tool was used to generate output for these files. Here is an example command used for creating a "-aws-document.json" file:

```bash
./cmake-build/csfle create_datakey \
        --kms_providers_file ~/.csfle/kms_providers.json \
        --kms_provider aws \
        --aws_kek_region us-east-1 \
        --aws_kek_key 'arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0' \
        --key_material "p928TIvgDVH2jZ2OSF81HI7cjSIGsk2ODhgW0AX75SDkiRJQR9ZHsNhoS/vb8JwwQIXtCGq6bCsrFnfMyRztiEenM79eVoLISz7nlp5KX+Dgwh5ePuGQWVpV+DFH2N4q"
```
