import { ParsedObject } from './xml';

export type FieldType = 'text' | 'object' | 'array';

export interface SimpleFieldSchema {
  type: 'text';
  name: string;
}

export interface ObjectFieldSchema {
  type: 'object';
  name: string;
  fields: FieldSchema[];
}

export interface ArrayFieldSchema {
  type: 'array';
  name: string;
  itemSchema: FieldSchema[];
}

export type FieldSchema = SimpleFieldSchema | ObjectFieldSchema | ArrayFieldSchema;

export interface ElementSchema {
  rootElement: string;
  fields: FieldSchema[];
}

export type ParsedResult = ParsedObject[];
