#!/usr/bin/env bash
#
# generate-sbom.sh - Generate and validate CycloneDX SBOM
#
# Usage: ./generate-sbom.sh [output-file]
#
# Environment variables:
#   GITHUB_OUTPUT - Path to GitHub Actions output file (optional)
#

set -euo pipefail

SBOM_FILE="${1:-sbom.json}"
TEMP_SBOM="sbom-new.json"
CYCLONEDX_CLI="/tmp/cyclonedx"
CYCLONEDX_CLI_URL="https://github.com/CycloneDX/cyclonedx-cli/releases/download/v0.29.1/cyclonedx-linux-x64"
JQ_NORMALIZER='del(.serialNumber) | del(.metadata.timestamp) | walk(if type == "object" and .timestamp then .timestamp = "TIMESTAMP_NORMALIZED" else . end)'

echo "Starting SBOM generation (output: $SBOM_FILE)"

echo "Generating SBOM for 'node' project..."

if ! npx @cyclonedx/cyclonedx-npm \
    --omit dev \
    --package-lock-only \
    --output-file "$TEMP_SBOM" \
    --output-format json \
    --spec-version 1.5; then
    echo "ERROR: Failed to generate SBOM" >&2
    exit 1
fi

if [[ ! -f "$TEMP_SBOM" ]]; then
    echo "ERROR: SBOM file not found after generation" >&2
    exit 1
fi

echo "SBOM file generated: $TEMP_SBOM"

echo "Downloading CycloneDX CLI..."

if ! curl -L -s -o "$CYCLONEDX_CLI" "$CYCLONEDX_CLI_URL"; then
    echo "ERROR: Failed to download CycloneDX CLI" >&2
    exit 1
fi

chmod +x "$CYCLONEDX_CLI"

if [[ ! -x "$CYCLONEDX_CLI" ]]; then
    echo "ERROR: CycloneDX CLI is not executable" >&2
    exit 1
fi

echo "CycloneDX CLI ready at $CYCLONEDX_CLI"

echo "Validating SBOM: $TEMP_SBOM"

if ! "$CYCLONEDX_CLI" validate --input-file "$TEMP_SBOM" --fail-on-errors; then
    echo "ERROR: SBOM validation failed for $TEMP_SBOM" >&2
    exit 1
fi

echo "SBOM validation passed: $TEMP_SBOM"

echo "Checking for SBOM changes..."

HAS_CHANGES="false"

if [[ ! -f "$SBOM_FILE" ]]; then
    echo "No existing $SBOM_FILE found, creating initial version"
    mv "$TEMP_SBOM" "$SBOM_FILE"
    HAS_CHANGES="true"
else
    echo "Comparing new SBOM with existing $SBOM_FILE..."

    # Try cyclonedx diff for component-level comparison
    DIFF_OUTPUT=$("$CYCLONEDX_CLI" diff "$SBOM_FILE" "$TEMP_SBOM" --component-versions 2>/dev/null || true)

    if echo "$DIFF_OUTPUT" | grep -q "^None$"; then
        echo "No component changes detected via cyclonedx diff"

        # Double-check with jq normalization (excludes metadata like timestamps)
        if diff -q \
            <(jq -r "$JQ_NORMALIZER" < "$SBOM_FILE") \
            <(jq -r "$JQ_NORMALIZER" < "$TEMP_SBOM") > /dev/null 2>&1; then
            echo "No meaningful changes detected in SBOM"
            rm -f "$TEMP_SBOM"
            HAS_CHANGES="false"
        else
            echo "Changes detected in SBOM (non-component changes)"
            mv "$TEMP_SBOM" "$SBOM_FILE"
            HAS_CHANGES="true"
        fi
    else
        echo "Component changes detected:"
        echo "$DIFF_OUTPUT"
        mv "$TEMP_SBOM" "$SBOM_FILE"
        HAS_CHANGES="true"
    fi
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    echo "HAS_CHANGES=${HAS_CHANGES}" >> "$GITHUB_OUTPUT"
fi
echo "Output: HAS_CHANGES=${HAS_CHANGES}"

if [[ ! -f "$SBOM_FILE" ]]; then
    echo "ERROR: Final SBOM file not found at $SBOM_FILE" >&2
    exit 1
fi

echo "SBOM file validated: $SBOM_FILE"
echo "SBOM generation completed successfully"