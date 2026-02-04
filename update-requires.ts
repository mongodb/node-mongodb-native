import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = path.join(__dirname, 'test');

interface RequireInfo {
  line: string;
  lineNumber: number;
  requirePath: string;
  variableName: string | null;
  destructured: string[] | null;
}

/**
 * Recursively get all JavaScript files in a directory
 */
function getJsFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      getJsFiles(filePath, fileList);
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  }

  return fileList;
}

/**
 * Calculate relative path from file to test/mongodb.js
 */
function getRelativeMongodbPath(fromFile: string): string {
  const mongodbPath = path.join(__dirname, 'test', 'mongodb.js');
  const relative = path.relative(path.dirname(fromFile), mongodbPath);
  // Remove .js extension and normalize
  const importPath = relative.replace(/\.js$/, '').replace(/\\/g, '/');
  return importPath.startsWith('.') ? importPath : `./${importPath}`;
}

/**
 * Parse require statements from src
 */
function parseRequires(content: string): RequireInfo[] {
  const lines = content.split('\n');
  const requires: RequireInfo[] = [];

  // Match various require patterns:
  // const foo = require('path');
  // const { foo, bar } = require('path');
  // const { foo: bar } = require('path');
  const requireRegex = /^(?:const|let|var)\s+({[^}]+}|[\w$]+)\s*=\s*require\(['"]([^'"]+)['"]\)/;
  const destructuredRegex = /{([^}]+)}/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(requireRegex);

    if (match) {
      const variableClause = match[1];
      const requirePath = match[2];

      // Only process requires from ../../../src or similar patterns
      if (requirePath.includes('/src/') || requirePath.match(/^\.\.\/.*\/src\//)) {
        let variableName: string | null = null;
        let destructured: string[] | null = null;

        if (variableClause.startsWith('{')) {
          // Destructured require
          const destructMatch = variableClause.match(destructuredRegex);
          if (destructMatch) {
            destructured = destructMatch[1]
              .split(',')
              .map(s => s.trim())
              .filter(s => s.length > 0);
          }
        } else {
          // Simple variable assignment
          variableName = variableClause.trim();
        }

        requires.push({
          line,
          lineNumber: i,
          requirePath,
          variableName,
          destructured
        });
      }
    }
  }

  return requires;
}

/**
 * Update requires in a file
 */
function updateFileRequires(filePath: string, dryRun = false): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');
  const requires = parseRequires(content);

  if (requires.length === 0) {
    return false;
  }

  const lines = content.split('\n');
  const newMongodbPath = getRelativeMongodbPath(filePath);

  // Group all requires from src
  const allDestructured: string[] = [];
  const simpleRequires: Array<{ varName: string; path: string }> = [];
  const linesToRemove = new Set<number>();

  for (const req of requires) {
    linesToRemove.add(req.lineNumber);

    if (req.destructured) {
      allDestructured.push(...req.destructured);
    } else if (req.variableName) {
      // For simple requires, we might need to keep them separate if they're different
      // But for mongodb, we'll try to convert to destructured
      simpleRequires.push({ varName: req.variableName, path: req.requirePath });
    }
  }

  // Build the new require statement(s)
  const newRequires: string[] = [];

  if (allDestructured.length > 0) {
    // Check if we need multiline
    const destructuredList = allDestructured.join(', ');
    if (destructuredList.length > 80) {
      newRequires.push(
        `const {\n  ${allDestructured.join(',\n  ')}\n} = require('${newMongodbPath}');`
      );
    } else {
      newRequires.push(`const { ${destructuredList} } = require('${newMongodbPath}');`);
    }
  }

  // Add simple requires - these stay as separate requires for now
  // (converting them would require knowing what they export)
  for (const simple of simpleRequires) {
    newRequires.push(`const ${simple.varName} = require('${newMongodbPath}');`);
  }

  // Replace the requires
  const updatedLines: string[] = [];
  let requireInserted = false;

  for (let i = 0; i < lines.length; i++) {
    if (linesToRemove.has(i)) {
      // Insert the new require at the first removed line
      if (!requireInserted && newRequires.length > 0) {
        updatedLines.push(...newRequires);
        requireInserted = true;
      }
      // Skip the old require line
      continue;
    }
    updatedLines.push(lines[i]);
  }

  const newContent = updatedLines.join('\n');

  if (dryRun) {
    console.log(`\n${filePath}:`);
    console.log('  Would replace:');
    for (const req of requires) {
      console.log(`    ${req.line}`);
    }
    console.log('  With:');
    for (const newReq of newRequires) {
      console.log(`    ${newReq}`);
    }
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

  console.log('Finding JavaScript files in test directory...');
  const jsFiles = getJsFiles(TEST_DIR);
  console.log(`Found ${jsFiles.length} JavaScript files\n`);

  if (dryRun) {
    console.log('DRY RUN MODE - No files will be modified\n');
  }

  let updatedCount = 0;

  for (const file of jsFiles) {
    if (updateFileRequires(file, dryRun)) {
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
  console.error('Error updating requires:', error);
  process.exit(1);
}
