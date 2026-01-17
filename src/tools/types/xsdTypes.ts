/**
 * Type definitions for XSD (XML Schema Definition) structures
 * Used for parsing and analyzing XSD files
 */

export interface XSDModel {
  targetNamespace?: string;
  elements: ElementDefinition[];
  complexTypes: ComplexTypeDefinition[];
  simpleTypes: SimpleTypeDefinition[];
  imports: XSDImport[];
  includes: XSDInclude[];
  location: string; // File path where this schema was loaded from
}

export interface ElementDefinition {
  name: string;
  type?: string; // Reference to complexType or simpleType
  minOccurs?: number | string; // number or "unbounded"
  maxOccurs?: number | string; // number or "unbounded"
  nillable?: boolean;
  namespace?: string;
  // For inline complex types
  complexType?: ComplexTypeDefinition;
  // For inline simple types
  simpleType?: SimpleTypeDefinition;
}

export interface ComplexTypeDefinition {
  name: string;
  sequence?: ContentModel;
  choice?: ContentModel;
  all?: ContentModel;
  extension?: TypeExtension;
  restriction?: TypeRestriction;
  mixed?: boolean;
  namespace?: string;
}

export interface ContentModel {
  elements: ElementDefinition[];
  minOccurs?: number | string;
  maxOccurs?: number | string;
}

export interface TypeExtension {
  base: string; // Base type name
  sequence?: ContentModel;
  choice?: ContentModel;
  all?: ContentModel;
}

export interface TypeRestriction {
  base: string; // Base type name
  sequence?: ContentModel;
  choice?: ContentModel;
  all?: ContentModel;
}

export interface SimpleTypeDefinition {
  name: string;
  restriction?: {
    base: string;
    enumeration?: string[];
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  };
  union?: {
    memberTypes: string[];
  };
  list?: {
    itemType: string;
  };
  namespace?: string;
}

export interface XSDImport {
  namespace?: string;
  schemaLocation?: string;
  resolved?: boolean;
  resolvedModel?: XSDModel;
}

export interface XSDInclude {
  schemaLocation: string;
  resolved?: boolean;
  resolvedModel?: XSDModel;
}
