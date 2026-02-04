import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = path.join(__dirname, 'test');

interface ImportInfo {
  line: string;
  lineNumber: number;
  importPath: string;
  importedItems: string[];
}

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
    } else if (file.endsWith('.ts')) {
      fileList.push(filePath);
    }
  }

  return fileList;
}

/**
 * Calculate relative path from file to test/mongodb.ts
 */
function getRelativeMongodbPath(fromFile: string): string {
  const mongodbPath = path.join(__dirname, 'test', 'mongodb.ts');
  const relative = path.relative(path.dirname(fromFile), mongodbPath);
  // Remove .ts extension and normalize
  const importPath = relative.replace(/\.ts$/, '').replace(/\\/g, '/');
  return importPath.startsWith('.') ? importPath : `./${importPath}`;
}

/**
 * Parse import statements from src
 */
function parseImports(content: string): ImportInfo[] {
  const lines = content.split('\n');
  const imports: ImportInfo[] = [];

  const importRegex = /^import\s+({[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/;
  const namedImportRegex = /{([^}]+)}/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(importRegex);

    if (match) {
      const importClause = match[1];
      const importPath = match[2];

      // Only process imports from ../../../src or similar patterns
      if (importPath.includes('/src/') || importPath.match(/^\.\.\/.*\/src\//)) {
        const importedItems: string[] = [];

        if (importClause.startsWith('{')) {
          // Named imports
          const namedMatch = importClause.match(namedImportRegex);
          if (namedMatch) {
            importedItems.push(
              ...namedMatch[1]
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0)
            );
          }
        } else if (importClause.startsWith('* as ')) {
          // Namespace import
          importedItems.push(importClause);
        } else {
          // Default import
          importedItems.push(importClause);
        }

        imports.push({
          line,
          lineNumber: i,
          importPath,
          importedItems
        });
      }
    }
  }

  return imports;
}

/**
 * Update imports in a file
 */
function updateFileImports(filePath: string, dryRun = false): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');
  const imports = parseImports(content);

  if (imports.length === 0) {
    return false;
  }

  const lines = content.split('\n');
  const newMongodbPath = getRelativeMongodbPath(filePath);

  // Group all imports from src
  const allImportedItems: string[] = [];
  const namespaceImports: string[] = [];
  const defaultImports: string[] = [];
  const linesToRemove = new Set<number>();

  for (const imp of imports) {
    linesToRemove.add(imp.lineNumber);

    for (const item of imp.importedItems) {
      if (item.startsWith('* as ')) {
        namespaceImports.push(item);
      } else if (item.startsWith('type ') || item.includes(' as ')) {
        // Keep type imports and renamed imports
        allImportedItems.push(item);
      } else {
        allImportedItems.push(item);
      }
    }
  }

  // Build the new import statement
  let newImport = '';
  if (allImportedItems.length > 0) {
    // Check if we need multiline
    const importList = allImportedItems.join(', ');
    if (importList.length > 80) {
      newImport = `import {\n  ${allImportedItems.join(',\n  ')}\n} from '${newMongodbPath}';`;
    } else {
      newImport = `import { ${importList} } from '${newMongodbPath}';`;
    }
  }

  // Add namespace imports separately
  for (const ns of namespaceImports) {
    if (newImport) newImport += '\n';
    newImport += `import ${ns} from '${newMongodbPath}';`;
  }

  // Replace the imports
  const updatedLines: string[] = [];
  let importInserted = false;

  for (let i = 0; i < lines.length; i++) {
    if (linesToRemove.has(i)) {
      // Insert the new import at the first removed line
      if (!importInserted && newImport) {
        updatedLines.push(newImport);
        importInserted = true;
      }
      // Skip the old import line
      continue;
    }
    updatedLines.push(lines[i]);
  }

  const newContent = updatedLines.join('\n');

  if (dryRun) {
    console.log(`\n${filePath}:`);
    console.log('  Would replace:');
    for (const imp of imports) {
      console.log(`    ${imp.line}`);
    }
    console.log('  With:');
    console.log(`    ${newImport}`);
  } else {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log(`✓ Updated ${path.relative(__dirname, filePath)}`);
  }

  return true;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-n');

  console.log('Finding TypeScript files in test directory...');
  const tsFiles = getTsFiles(TEST_DIR);
  console.log(`Found ${tsFiles.length} TypeScript files\n`);

  if (dryRun) {
    console.log('DRY RUN MODE - No files will be modified\n');
  }

  let updatedCount = 0;

  for (const file of tsFiles) {
    if (updateFileImports(file, dryRun)) {
      updatedCount++;
    }
  }

  console.log(`\n${dryRun ? 'Would update' : 'Updated'} ${updatedCount} files`);

  if (dryRun) {
    console.log('\nRun without --dry-run to apply changes');
  }
}

// Run the script
try {
  main();
} catch (error) {
  console.error('Error updating imports:', error);
  process.exit(1);
}
