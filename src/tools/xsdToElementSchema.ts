/**
 * XSD to ElementSchema Mapper
 * Maps XSD schema definitions to ElementSchema format
 */

import {
  FieldSchema,
  ElementSchema,
} from '../types/schema';
import {
  XSDModel as XSDModelType,
  ElementDefinition as XSDElementDefinition,
  ComplexTypeDefinition as XSDComplexTypeDefinition,
} from './types/xsdTypes';

/**
 * Map XSD model to ElementSchema
 */
export function mapXSDToElementSchema(
  xsdModel: XSDModelType,
  rootElementName: string,
  namespace?: string
): ElementSchema {
  // Find the root element
  const rootElement = xsdModel.elements.find(
    (elem) => elem.name.toLowerCase() === rootElementName.toLowerCase()
  );

  if (!rootElement) {
    throw new Error(
      `Root element '${rootElementName}' not found in XSD schema. Available elements: ${xsdModel.elements.map((e) => e.name).join(', ')}`
    );
  }

  // Get the type definition for the root element
  let rootType: XSDComplexTypeDefinition | undefined;

  if (rootElement.complexType) {
    rootType = rootElement.complexType;
  } else if (rootElement.type) {
    // Look up the type
    rootType = findComplexType(xsdModel, rootElement.type);
  }

  if (!rootType) {
    // If no complex type, treat as simple text element
    return {
      rootElement: rootElementName,
      fields: [{ type: 'text', name: rootElementName }],
    };
  }

  // Map the complex type to fields
  const fields = mapComplexTypeToFields(xsdModel, rootType);

  return {
    rootElement: rootElementName,
    fields,
  };
}

/**
 * Map a complex type to field schemas
 */
function mapComplexTypeToFields(
  xsdModel: XSDModelType,
  complexType: XSDComplexTypeDefinition
): FieldSchema[] {
  const fields: FieldSchema[] = [];

  // Handle extension - merge base type fields with extension fields
  if (complexType.extension) {
    const baseType = findComplexType(xsdModel, complexType.extension.base);
    if (baseType) {
      const baseFields = mapComplexTypeToFields(xsdModel, baseType);
      fields.push(...baseFields);
    }

    // Add extension fields
    if (complexType.extension.sequence) {
      const extFields = mapContentModelToFields(xsdModel, complexType.extension.sequence);
      fields.push(...extFields);
    }
    if (complexType.extension.choice) {
      const extFields = mapContentModelToFields(xsdModel, complexType.extension.choice);
      fields.push(...extFields);
    }
    if (complexType.extension.all) {
      const extFields = mapContentModelToFields(xsdModel, complexType.extension.all);
      fields.push(...extFields);
    }
  }

  // Handle restriction
  if (complexType.restriction) {
    const baseType = findComplexType(xsdModel, complexType.restriction.base);
    if (baseType) {
      const baseFields = mapComplexTypeToFields(xsdModel, baseType);
      fields.push(...baseFields);
    }
  }

  // Handle direct content models
  if (complexType.sequence) {
    const seqFields = mapContentModelToFields(xsdModel, complexType.sequence);
    fields.push(...seqFields);
  }

  if (complexType.choice) {
    const choiceFields = mapContentModelToFields(xsdModel, complexType.choice);
    fields.push(...choiceFields);
  }

  if (complexType.all) {
    const allFields = mapContentModelToFields(xsdModel, complexType.all);
    fields.push(...allFields);
  }

  return fields;
}

/**
 * Map content model (sequence/choice/all) to field schemas
 */
function mapContentModelToFields(
  xsdModel: XSDModelType,
  contentModel: { elements: XSDElementDefinition[] }
): FieldSchema[] {
  const fields: FieldSchema[] = [];

  for (const element of contentModel.elements) {
    const field = mapElementToField(xsdModel, element);
    if (field) {
      fields.push(field);
    }
  }

  return fields;
}

/**
 * Map an XSD element to a field schema
 */
function mapElementToField(
  xsdModel: XSDModelType,
  element: XSDElementDefinition
): FieldSchema | null {
  if (!element.name) {
    return null;
  }

  // Determine field type
  const fieldType = determineFieldType(xsdModel, element);

  if (fieldType === 'array') {
    // Array field
    const itemSchema = getItemSchema(xsdModel, element);
    return {
      type: 'array',
      name: element.name,
      itemSchema,
    };
  } else if (fieldType === 'object') {
    // Object field
    const complexType = getComplexTypeForElement(xsdModel, element);
    if (complexType) {
      const fields = mapComplexTypeToFields(xsdModel, complexType);
      return {
        type: 'object',
        name: element.name,
        fields,
      };
    }
    // Fallback to text if complex type not found
    return {
      type: 'text',
      name: element.name,
    };
  } else {
    // Text field
    return {
      type: 'text',
      name: element.name,
    };
  }
}

/**
 * Determine field type based on XSD element
 */
function determineFieldType(
  xsdModel: XSDModelType,
  element: XSDElementDefinition
): 'text' | 'object' | 'array' {
  // Check if it's an array (maxOccurs > 1 or unbounded)
  const maxOccurs = element.maxOccurs;
  const isArray =
    maxOccurs === 'unbounded' ||
    (typeof maxOccurs === 'number' && maxOccurs > 1) ||
    (typeof maxOccurs === 'string' && maxOccurs !== '1' && maxOccurs !== '');

  if (isArray) {
    return 'array';
  }

  // Check if it has a complex type
  if (element.complexType) {
    return 'object';
  }

  if (element.type) {
    const complexType = findComplexType(xsdModel, element.type);
    if (complexType) {
      return 'object';
    }
  }

  // Default to text
  return 'text';
}

/**
 * Get item schema for an array element
 */
function getItemSchema(
  xsdModel: XSDModelType,
  element: XSDElementDefinition
): FieldSchema[] {
  const complexType = getComplexTypeForElement(xsdModel, element);

  if (complexType) {
    return mapComplexTypeToFields(xsdModel, complexType);
  }

  // If no complex type, it's a simple array of text
  return [{ type: 'text', name: 'value' }];
}

/**
 * Get complex type for an element
 */
function getComplexTypeForElement(
  xsdModel: XSDModelType,
  element: XSDElementDefinition
): XSDComplexTypeDefinition | undefined {
  if (element.complexType) {
    return element.complexType;
  }

  if (element.type) {
    return findComplexType(xsdModel, element.type);
  }

  return undefined;
}

/**
 * Find a complex type by name (handles namespace prefixes)
 */
function findComplexType(
  xsdModel: XSDModelType,
  typeName: string
): XSDComplexTypeDefinition | undefined {
  // Remove namespace prefix if present
  const localName = typeName.split(':').pop() || typeName;

  // Search in current schema
  let complexType = xsdModel.complexTypes.find((ct) => ct.name === localName);
  if (complexType) {
    return complexType;
  }

  // Search in imported/included schemas
  for (const imp of xsdModel.imports) {
    if (imp.resolvedModel) {
      complexType = findComplexType(imp.resolvedModel, typeName);
      if (complexType) {
        return complexType;
      }
    }
  }

  for (const inc of xsdModel.includes) {
    if (inc.resolvedModel) {
      complexType = findComplexType(inc.resolvedModel, typeName);
      if (complexType) {
        return complexType;
      }
    }
  }

  return undefined;
}
