#!/usr/bin/env node
/**
 * XSD to ElementSchema Converter CLI Tool
 * Converts XSD files to TypeScript ElementSchema definitions
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseXSD, resolveImports } from './xsdParser';
import { mapXSDToElementSchema } from './xsdToElementSchema';
import { ElementSchema } from '../types/schema';

interface CLIArgs {
  input: string;
  output: string;
  rootElement: string;
  namespace?: string;
  watch?: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CLIArgs {
  const args: Partial<CLIArgs> = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const nextArg = argv[i + 1];

    if (arg === '--input' || arg === '-i') {
      args.input = nextArg;
      i++;
    } else if (arg === '--output' || arg === '-o') {
      args.output = nextArg;
      i++;
    } else if (arg === '--root-element' || arg === '-r') {
      args.rootElement = nextArg;
      i++;
    } else if (arg === '--namespace' || arg === '-n') {
      args.namespace = nextArg;
      i++;
    } else if (arg === '--watch' || arg === '-w') {
      args.watch = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  // Validate required arguments
  if (!args.input || !args.output || !args.rootElement) {
    console.error('Error: Missing required arguments');
    printHelp();
    process.exit(1);
  }

  return args as CLIArgs;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
XSD to ElementSchema Converter

Usage:
  npm run convert-xsd -- --input <xsd-file> --output <ts-file> --root-element <name> [options]

Options:
  -i, --input <path>          Path to XSD file or directory containing XSD files
  -o, --output <path>          Output TypeScript file path
  -r, --root-element <name>   Name of root element to generate schema for
  -n, --namespace <ns>        Target namespace (optional, for multi-namespace schemas)
  -w, --watch                  Watch mode: regenerate on XSD file changes
  -h, --help                   Show this help message

Examples:
  npm run convert-xsd -- -i schema.xsd -o src/config/schema.ts -r Toy
  npm run convert-xsd -- -i schemas/ -o src/config/schema.ts -r Product -n http://example.com/ns
`);
}

/**
 * Generate TypeScript code from ElementSchema
 */
function generateTypeScriptCode(schema: ElementSchema, schemaName: string = 'generatedSchema'): string {
  const indent = (level: number) => '  '.repeat(level);

  const formatField = (field: any, level: number = 2): string => {
    if (field.type === 'text') {
      return `${indent(level)}{ type: 'text', name: '${field.name}' }`;
    } else if (field.type === 'object') {
      const fieldsStr = field.fields.map((f: any) => formatField(f, level + 1)).join(',\n');
      return `${indent(level)}{\n${indent(level + 1)}type: 'object',\n${indent(level + 1)}name: '${field.name}',\n${indent(level + 1)}fields: [\n${fieldsStr}\n${indent(level + 1)}]\n${indent(level)}}`;
    } else if (field.type === 'array') {
      const itemSchemaStr = field.itemSchema.map((f: any) => formatField(f, level + 2)).join(',\n');
      return `${indent(level)}{\n${indent(level + 1)}type: 'array',\n${indent(level + 1)}name: '${field.name}',\n${indent(level + 1)}itemSchema: [\n${itemSchemaStr}\n${indent(level + 1)}]\n${indent(level)}}`;
    }
    return '';
  };

  const fieldsStr = schema.fields.map((f) => formatField(f)).join(',\n');

  return `import { ElementSchema } from '../types/schema';

/**
 * Generated ElementSchema from XSD
 * Root element: ${schema.rootElement}
 * Generated: ${new Date().toISOString()}
 */
export const ${schemaName}: ElementSchema = {
  rootElement: '${schema.rootElement}',
  fields: [
${fieldsStr}
  ]
};
`;
}

/**
 * Convert XSD to ElementSchema and generate TypeScript file
 */
async function convertXSD(args: CLIArgs): Promise<void> {
  try {
    console.log(`Parsing XSD file: ${args.input}`);

    // Parse the XSD file
    const xsdModel = await parseXSD(args.input);

    // Resolve imports and includes
    const basePath = path.dirname(args.input);
    const { imports, includes } = await resolveImports(
      basePath,
      xsdModel.imports,
      xsdModel.includes
    );

    xsdModel.imports = imports;
    xsdModel.includes = includes;

    console.log(`Resolved ${imports.filter((i) => i.resolved).length} imports and ${includes.filter((i) => i.resolved).length} includes`);

    // Map to ElementSchema
    console.log(`Mapping to ElementSchema for root element: ${args.rootElement}`);
    const elementSchema = mapXSDToElementSchema(xsdModel, args.rootElement, args.namespace);

    // Generate TypeScript code
    const schemaName = path.basename(args.output, '.ts').replace(/[^a-zA-Z0-9]/g, '') + 'Schema';
    const tsCode = generateTypeScriptCode(elementSchema, schemaName);

    // Ensure output directory exists
    const outputDir = path.dirname(args.output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write output file
    fs.writeFileSync(args.output, tsCode, 'utf-8');
    console.log(`✓ Successfully generated: ${args.output}`);
    console.log(`  Root element: ${elementSchema.rootElement}`);
    console.log(`  Fields: ${elementSchema.fields.length}`);
  } catch (error) {
    console.error('Error converting XSD:', error);
    process.exit(1);
  }
}

/**
 * Watch mode: regenerate on file changes
 */
function watchMode(args: CLIArgs): void {
  console.log(`Watching for changes in: ${args.input}`);
  console.log('Press Ctrl+C to stop watching\n');

  // Initial conversion
  convertXSD(args).catch((error) => {
    console.error('Initial conversion failed:', error);
  });

  // Watch for changes
  fs.watchFile(args.input, { interval: 1000 }, () => {
    console.log('\nFile changed, regenerating...');
    convertXSD(args).catch((error) => {
      console.error('Conversion failed:', error);
    });
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs();

  if (args.watch) {
    watchMode(args);
  } else {
    await convertXSD(args);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
