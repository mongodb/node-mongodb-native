# Visual Studio Setup

Make use of the following code workspace config to get the ideal setup for working on the driver.

```jsonc
{
    "folders": [
        {
            "name": "driver",
            "path": "PATH_TO_DRIVER"
        }
    ],
    "settings": {
        // Automatic Formatting settings
        "editor.codeActionsOnSave": {
            "source.fixAll.eslint": true
        },
        "[json]": {
            "editor.formatOnSave": true
        },
        "[jsonc]": {
            "editor.formatOnSave": true
        },
        "[javascript]": {
            "editor.defaultFormatter": "dbaeumer.vscode-eslint"
        },
        "[typescript]": {
            "editor.defaultFormatter": "dbaeumer.vscode-eslint",
            "editor.codeActionsOnSave": {
                "source.organizeImports": false
            }
        },
        "files.autoSave": "onFocusChange",
        "files.trimTrailingWhitespace": true,
        "files.trimFinalNewlines": true,
        "files.insertFinalNewline": true,
        // Testing settings
        "mochaExplorer.files": "test/unit/**/*.test.js",
        "mochaExplorer.ui": "test/tools/runner/metadata_ui.js",
        "mochaExplorer.envPath": null, // Useful for more advanced tests
        // Typescript settings
        "typescript.disableAutomaticTypeAcquisition": true,
        "typescript.tsdk": "./node_modules/typescript/lib",
        // Editor nice to haves
        "editor.rulers": [
            100
        ],
        "editor.renderWhitespace": "selection"
    },
    "extensions": {
        "recommendations": [
            "streetsidesoftware.code-spell-checker",
            "dbaeumer.vscode-eslint",
            "hbenl.vscode-test-explorer",
            "hbenl.vscode-mocha-test-adapter",
            "github.vscode-pull-request-github",
            "mongodb.mongodb-vscode"
        ],
        "unwantedRecommendations": [
            "esbenp.prettier-vscode"
        ]
    }
}

```
