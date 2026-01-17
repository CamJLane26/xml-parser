/**
 * XSD Parser Module
 * Parses XSD files and extracts schema definitions
 */

import { DOMParser, XMLSerializer } from 'xmldom';
import * as xpath from 'xpath';
import * as fs from 'fs';
import * as path from 'path';
import {
  XSDModel,
  ElementDefinition,
  ComplexTypeDefinition,
  SimpleTypeDefinition,
  XSDImport,
  XSDInclude,
  ContentModel,
} from './types/xsdTypes';

const XSD_NS = 'http://www.w3.org/2001/XMLSchema';
const NS_PREFIX = 'xs';

/**
 * Parse an XSD file and extract schema definitions
 */
export async function parseXSD(filePath: string): Promise<XSDModel> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const doc = new DOMParser().parseFromString(content, 'text/xml');

  // Check for parsing errors
  const parserError = doc.getElementsByTagName('parsererror');
  if (parserError.length > 0) {
    throw new Error(`Failed to parse XSD file: ${filePath}\n${parserError[0].textContent}`);
  }

  const schemaElement = doc.documentElement;
  if (!schemaElement || schemaElement.nodeName !== 'schema') {
    throw new Error(`Invalid XSD file: ${filePath}. Root element must be <schema>`);
  }

  const targetNamespace = schemaElement.getAttribute('targetNamespace') || undefined;

  // Extract imports
  const imports = extractImports(schemaElement, path.dirname(filePath));

  // Extract includes
  const includes = extractIncludes(schemaElement, path.dirname(filePath));

  // Extract elements
  const elements = extractElements(schemaElement);

  // Extract complex types
  const complexTypes = extractComplexTypes(schemaElement);

  // Extract simple types
  const simpleTypes = extractSimpleTypes(schemaElement);

  return {
    targetNamespace,
    elements,
    complexTypes,
    simpleTypes,
    imports,
    includes,
    location: filePath,
  };
}

/**
 * Extract element definitions from schema
 */
function extractElements(schemaElement: Element): ElementDefinition[] {
  const elements: ElementDefinition[] = [];
  const elementNodes = schemaElement.getElementsByTagNameNS(XSD_NS, 'element');

  for (let i = 0; i < elementNodes.length; i++) {
    const elem = elementNodes[i];
    const name = elem.getAttribute('name');
    if (!name) continue;

    const elementDef: ElementDefinition = {
      name,
      type: elem.getAttribute('type') || undefined,
      minOccurs: parseOccurs(elem.getAttribute('minOccurs')),
      maxOccurs: parseOccurs(elem.getAttribute('maxOccurs')),
      nillable: elem.getAttribute('nillable') === 'true',
    };

    // Check for inline complexType
    const complexTypeNodes = elem.getElementsByTagNameNS(XSD_NS, 'complexType');
    if (complexTypeNodes.length > 0) {
      elementDef.complexType = extractComplexTypeFromNode(complexTypeNodes[0]);
    }

    // Check for inline simpleType
    const simpleTypeNodes = elem.getElementsByTagNameNS(XSD_NS, 'simpleType');
    if (simpleTypeNodes.length > 0) {
      elementDef.simpleType = extractSimpleTypeFromNode(simpleTypeNodes[0]);
    }

    elements.push(elementDef);
  }

  return elements;
}

/**
 * Extract complex type definitions from schema
 */
function extractComplexTypes(schemaElement: Element): ComplexTypeDefinition[] {
  const complexTypes: ComplexTypeDefinition[] = [];
  const typeNodes = schemaElement.getElementsByTagNameNS(XSD_NS, 'complexType');

  for (let i = 0; i < typeNodes.length; i++) {
    const typeNode = typeNodes[i];
    const name = typeNode.getAttribute('name');
    if (!name) continue;

    const complexType = extractComplexTypeFromNode(typeNode);
    complexType.name = name;
    complexTypes.push(complexType);
  }

  return complexTypes;
}

/**
 * Extract complex type from a node
 */
function extractComplexTypeFromNode(typeNode: Element): ComplexTypeDefinition {
  const complexType: ComplexTypeDefinition = {
    name: typeNode.getAttribute('name') || '',
    mixed: typeNode.getAttribute('mixed') === 'true',
  };

  // Check for extension
  const extensionNodes = typeNode.getElementsByTagNameNS(XSD_NS, 'extension');
  if (extensionNodes.length > 0) {
    const extNode = extensionNodes[0];
    complexType.extension = {
      base: extNode.getAttribute('base') || '',
      ...extractContentModel(extNode),
    };
  }

  // Check for restriction
  const restrictionNodes = typeNode.getElementsByTagNameNS(XSD_NS, 'restriction');
  if (restrictionNodes.length > 0) {
    const resNode = restrictionNodes[0];
    complexType.restriction = {
      base: resNode.getAttribute('base') || '',
      ...extractContentModel(resNode),
    };
  }

  // Extract content model (sequence, choice, all)
  const contentModel = extractContentModel(typeNode);
  if (contentModel.sequence) complexType.sequence = contentModel.sequence;
  if (contentModel.choice) complexType.choice = contentModel.choice;
  if (contentModel.all) complexType.all = contentModel.all;

  return complexType;
}

/**
 * Extract content model (sequence, choice, all) from a node
 */
function extractContentModel(parentNode: Element): {
  sequence?: ContentModel;
  choice?: ContentModel;
  all?: ContentModel;
} {
  const result: {
    sequence?: ContentModel;
    choice?: ContentModel;
    all?: ContentModel;
  } = {};

  // Check for sequence
  const sequenceNodes = parentNode.getElementsByTagNameNS(XSD_NS, 'sequence');
  if (sequenceNodes.length > 0) {
    const seqNode = sequenceNodes[0];
    result.sequence = {
      elements: extractElementsFromNode(seqNode),
      minOccurs: parseOccurs(seqNode.getAttribute('minOccurs')),
      maxOccurs: parseOccurs(seqNode.getAttribute('maxOccurs')),
    };
  }

  // Check for choice
  const choiceNodes = parentNode.getElementsByTagNameNS(XSD_NS, 'choice');
  if (choiceNodes.length > 0) {
    const choiceNode = choiceNodes[0];
    result.choice = {
      elements: extractElementsFromNode(choiceNode),
      minOccurs: parseOccurs(choiceNode.getAttribute('minOccurs')),
      maxOccurs: parseOccurs(choiceNode.getAttribute('maxOccurs')),
    };
  }

  // Check for all
  const allNodes = parentNode.getElementsByTagNameNS(XSD_NS, 'all');
  if (allNodes.length > 0) {
    const allNode = allNodes[0];
    result.all = {
      elements: extractElementsFromNode(allNode),
      minOccurs: parseOccurs(allNode.getAttribute('minOccurs')),
      maxOccurs: parseOccurs(allNode.getAttribute('maxOccurs')),
    };
  }

  return result;
}

/**
 * Extract elements from a content model node (sequence/choice/all)
 */
function extractElementsFromNode(parentNode: Element): ElementDefinition[] {
  const elements: ElementDefinition[] = [];
  const elementNodes = parentNode.getElementsByTagNameNS(XSD_NS, 'element');

  for (let i = 0; i < elementNodes.length; i++) {
    const elem = elementNodes[i];
    const name = elem.getAttribute('name');
    if (!name) continue;

    const elementDef: ElementDefinition = {
      name,
      type: elem.getAttribute('type') || undefined,
      minOccurs: parseOccurs(elem.getAttribute('minOccurs')),
      maxOccurs: parseOccurs(elem.getAttribute('maxOccurs')),
      nillable: elem.getAttribute('nillable') === 'true',
    };

    // Check for inline complexType
    const complexTypeNodes = elem.getElementsByTagNameNS(XSD_NS, 'complexType');
    if (complexTypeNodes.length > 0) {
      elementDef.complexType = extractComplexTypeFromNode(complexTypeNodes[0]);
    }

    // Check for inline simpleType
    const simpleTypeNodes = elem.getElementsByTagNameNS(XSD_NS, 'simpleType');
    if (simpleTypeNodes.length > 0) {
      elementDef.simpleType = extractSimpleTypeFromNode(simpleTypeNodes[0]);
    }

    elements.push(elementDef);
  }

  return elements;
}

/**
 * Extract simple type definitions from schema
 */
function extractSimpleTypes(schemaElement: Element): SimpleTypeDefinition[] {
  const simpleTypes: SimpleTypeDefinition[] = [];
  const typeNodes = schemaElement.getElementsByTagNameNS(XSD_NS, 'simpleType');

  for (let i = 0; i < typeNodes.length; i++) {
    const typeNode = typeNodes[i];
    const name = typeNode.getAttribute('name');
    if (!name) continue;

    const simpleType = extractSimpleTypeFromNode(typeNode);
    simpleType.name = name;
    simpleTypes.push(simpleType);
  }

  return simpleTypes;
}

/**
 * Extract simple type from a node
 */
function extractSimpleTypeFromNode(typeNode: Element): SimpleTypeDefinition {
  const simpleType: SimpleTypeDefinition = {
    name: typeNode.getAttribute('name') || '',
  };

  // Check for restriction
  const restrictionNodes = typeNode.getElementsByTagNameNS(XSD_NS, 'restriction');
  if (restrictionNodes.length > 0) {
    const resNode = restrictionNodes[0];
    const base = resNode.getAttribute('base');
    if (base) {
      simpleType.restriction = { base };

      // Extract enumeration values
      const enumNodes = resNode.getElementsByTagNameNS(XSD_NS, 'enumeration');
      if (enumNodes.length > 0) {
        simpleType.restriction.enumeration = [];
        for (let i = 0; i < enumNodes.length; i++) {
          const value = enumNodes[i].getAttribute('value');
          if (value) {
            simpleType.restriction.enumeration.push(value);
          }
        }
      }

      // Extract pattern
      const patternNodes = resNode.getElementsByTagNameNS(XSD_NS, 'pattern');
      if (patternNodes.length > 0) {
        simpleType.restriction.pattern = patternNodes[0].getAttribute('value') || undefined;
      }

      // Extract length constraints
      const minLength = resNode.getElementsByTagNameNS(XSD_NS, 'minLength');
      if (minLength.length > 0) {
        const value = minLength[0].getAttribute('value');
        if (value) {
          simpleType.restriction.minLength = parseInt(value, 10);
        }
      }

      const maxLength = resNode.getElementsByTagNameNS(XSD_NS, 'maxLength');
      if (maxLength.length > 0) {
        const value = maxLength[0].getAttribute('value');
        if (value) {
          simpleType.restriction.maxLength = parseInt(value, 10);
        }
      }
    }
  }

  // Check for union
  const unionNodes = typeNode.getElementsByTagNameNS(XSD_NS, 'union');
  if (unionNodes.length > 0) {
    const unionNode = unionNodes[0];
    const memberTypes = unionNode.getAttribute('memberTypes');
    if (memberTypes) {
      simpleType.union = {
        memberTypes: memberTypes.split(/\s+/).filter(Boolean),
      };
    }
  }

  // Check for list
  const listNodes = typeNode.getElementsByTagNameNS(XSD_NS, 'list');
  if (listNodes.length > 0) {
    const listNode = listNodes[0];
    const itemType = listNode.getAttribute('itemType');
    if (itemType) {
      simpleType.list = { itemType };
    }
  }

  return simpleType;
}

/**
 * Extract import declarations
 */
function extractImports(schemaElement: Element, basePath: string): XSDImport[] {
  const imports: XSDImport[] = [];
  const importNodes = schemaElement.getElementsByTagNameNS(XSD_NS, 'import');

  for (let i = 0; i < importNodes.length; i++) {
    const importNode = importNodes[i];
    imports.push({
      namespace: importNode.getAttribute('namespace') || undefined,
      schemaLocation: importNode.getAttribute('schemaLocation') || undefined,
      resolved: false,
    });
  }

  return imports;
}

/**
 * Extract include declarations
 */
function extractIncludes(schemaElement: Element, basePath: string): XSDInclude[] {
  const includes: XSDInclude[] = [];
  const includeNodes = schemaElement.getElementsByTagNameNS(XSD_NS, 'include');

  for (let i = 0; i < includeNodes.length; i++) {
    const includeNode = includeNodes[i];
    const schemaLocation = includeNode.getAttribute('schemaLocation');
    if (schemaLocation) {
      includes.push({
        schemaLocation,
        resolved: false,
      });
    }
  }

  return includes;
}

/**
 * Resolve imports and includes recursively
 */
export async function resolveImports(
  basePath: string,
  imports: XSDImport[],
  includes: XSDInclude[],
  visited: Set<string> = new Set()
): Promise<{ imports: XSDImport[]; includes: XSDInclude[] }> {
  const resolvedImports: XSDImport[] = [];
  const resolvedIncludes: XSDInclude[] = [];

  // Resolve includes first (they're in the same namespace)
  for (const include of includes) {
    if (include.resolved) {
      resolvedIncludes.push(include);
      continue;
    }

    const includePath = path.resolve(basePath, include.schemaLocation);
    if (!fs.existsSync(includePath)) {
      console.warn(`Warning: Include file not found: ${includePath}`);
      resolvedIncludes.push(include);
      continue;
    }

    if (visited.has(includePath)) {
      console.warn(`Warning: Circular include detected: ${includePath}`);
      resolvedIncludes.push({ ...include, resolved: true });
      continue;
    }

    visited.add(includePath);
    try {
      const includedModel = await parseXSD(includePath);
      include.resolved = true;
      include.resolvedModel = includedModel;

      // Recursively resolve imports/includes in the included schema
      const nested = await resolveImports(
        path.dirname(includePath),
        includedModel.imports,
        includedModel.includes,
        visited
      );
      resolvedIncludes.push(include);
    } catch (error) {
      console.error(`Error resolving include ${includePath}:`, error);
      resolvedIncludes.push(include);
    }
  }

  // Resolve imports
  for (const imp of imports) {
    if (imp.resolved) {
      resolvedImports.push(imp);
      continue;
    }

    if (!imp.schemaLocation) {
      resolvedImports.push(imp);
      continue;
    }

    const importPath = path.resolve(basePath, imp.schemaLocation);
    if (!fs.existsSync(importPath)) {
      console.warn(`Warning: Import file not found: ${importPath}`);
      resolvedImports.push(imp);
      continue;
    }

    if (visited.has(importPath)) {
      console.warn(`Warning: Circular import detected: ${importPath}`);
      resolvedImports.push({ ...imp, resolved: true });
      continue;
    }

    visited.add(importPath);
    try {
      const importedModel = await parseXSD(importPath);
      imp.resolved = true;
      imp.resolvedModel = importedModel;

      // Recursively resolve imports/includes in the imported schema
      const nested = await resolveImports(
        path.dirname(importPath),
        importedModel.imports,
        importedModel.includes,
        visited
      );
      resolvedImports.push(imp);
    } catch (error) {
      console.error(`Error resolving import ${importPath}:`, error);
      resolvedImports.push(imp);
    }
  }

  return { imports: resolvedImports, includes: resolvedIncludes };
}

/**
 * Parse occurs attribute (minOccurs/maxOccurs)
 */
function parseOccurs(value: string | null): number | string | undefined {
  if (!value) return undefined;
  if (value === 'unbounded') return 'unbounded';
  const num = parseInt(value, 10);
  return isNaN(num) ? undefined : num;
}
