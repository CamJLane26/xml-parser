export type ParsedValue = string | ParsedObject | ParsedValue[];

export interface ParsedObject {
  [key: string]: ParsedValue;
}

export interface ParsedElement {
  name: string;
  attributes: Record<string, string>;
  text?: string;
  children: ParsedElement[];
}
