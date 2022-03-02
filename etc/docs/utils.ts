import { argv } from "process";
import { createInterface } from "readline";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

export interface JsonVersionSchema {
    version: string;
}

export interface VersionSchema {
    version: string;
    status: string;
    api: string;
    usesMongoDBManual?: boolean;
    docs?: string;
    semverVersion: string;
}

export interface TomlVersionSchema {
    current: string;
    mongodDBManual: string;
    versions: VersionSchema[]
}

function prompt(prompt: string): Promise<string> {
    const rl = createInterface({
        input: process.stdin,
        output: process.stderr
    })

    return new Promise((resolve, _) => {
        rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer.trim());
        })
    });
}

export async function confirm(message: string) {
    const response = await prompt(message);
    if (response !== 'y') {
        console.error("something went wrong.  Exiting...");
        process.exit(1);
    }
}

export function getCommandLineArguments(): { semverVersion: string, status: string, skipPrompts, versionName: string } {
    const { status, version: semverVersion, yes: skipPrompts, versionName } = yargs(hideBin(process.argv)).option(
        'version', {
        type: 'string',
        description: 'The version of the docs to update',
        requiresArg: true
    }
    ).option('status', {
        type: 'string',
        choices: ['supported', 'not-supported', 'current'],
        default: 'current',
        requiresArg: true
    }).option('yes', {
        type: 'boolean',
        default: false,
        requiresArg: false,
        description: 'If set, will skip any prompts.'
    })
    .option('versionName', {
        type: 'string',
        requiresArg: true,
        description: 'The version identifier used on the docs site.  Will be displayed to in the form <versionName> Driver.  Defaults to the semverVersion.'
    })
    .demandOption('semverVersion', 'You must specify a version').argv;

    return {
        semverVersion,
        status,
        skipPrompts,
        versionName: versionName ?? semverVersion
    }
}

export function customSemverCompare(a: string, b: string) {
    // 'current' always bubbles to the front of the list
    if ([a, b].includes('current')) {
        return a === 'current' ? -1 : 1;
    }
    // put legacy 3x driver version at the end of the list
    if ([a, b].includes('core')) {
        return a === 'core' ? 1 : -1;
    }

    const [majorA, minorA] = a.split('.').map(Number)
    const [majorB, minorB] = b.split('.').map(Number);

    if (majorA === majorB) {
        return minorB > minorA ? 1 : -1
    }

    return majorB > majorA ? 1 : -1;
}
