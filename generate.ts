

import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.join(__dirname, 'src');
const OUTPUT_FILE = path.join(__dirname, 'test', 'mongodb.ts');

/**
 * Recursively get all TypeScript files in a directory
 */
function getTsFiles(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            getTsFiles(filePath, fileList);
        } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
            fileList.push(filePath);
        }
    }

    return fileList;
}

/**
 * Convert absolute path to relative import path
 */
function toImportPath(filePath: string): string {
    // Get relative path from output file to source file
    const relativePath = path.relative(path.dirname(OUTPUT_FILE), filePath);
    // Remove .ts extension and normalize path separators
    const importPath = relativePath.replace(/\.ts$/, '').replace(/\\/g, '/');
    // Ensure it starts with ./
    return importPath.startsWith('.') ? importPath : `../src/${importPath}`;
}

/**
 * Generate the mongodb.ts file with all exports
 */
function generateExportFile(): void {
    const tsFiles = getTsFiles(SRC_DIR);

    // Sort files for consistent output
    tsFiles.sort();

    const exports: string[] = [
        '/**',
        ' * Auto-generated file that exports everything from src/',
        ' * Generated on: ' + new Date().toISOString(),
        ' */',
        ''
    ];

    for (const file of tsFiles) {
        const importPath = toImportPath(file);
        exports.push(`export * from '${importPath}';`);
    }

    const content = exports.join('\n') + '\n';

    fs.writeFileSync(OUTPUT_FILE, content, 'utf-8');

    console.log(`✓ Generated ${OUTPUT_FILE}`);
    console.log(`✓ Exported ${tsFiles.length} files`);
}

// Run the generator
try {
    generateExportFile();
} catch (error) {
    console.error('Error generating export file:', error);
    process.exit(1);
} 