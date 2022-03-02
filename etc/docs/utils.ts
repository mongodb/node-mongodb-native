import { createInterface } from "readline";

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

export function getCommandLineArguments(): { semverVersion: string, status: string } {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('usage: generate-docs.ts <semver version> <status (optional)>')
        process.exit(1);
    }

    const semverVersion = args.shift();
    const status = args.shift() ?? 'current';
    return {
        semverVersion,
        status
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
