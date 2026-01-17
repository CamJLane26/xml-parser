import * as sax from 'sax';
import { Readable } from 'stream';
import { ElementSchema, FieldSchema, ParsedResult } from '../types/schema';
import { ParsedObject, ParsedValue } from '../types/xml';

interface ElementContext {
  name: string;
  text: string;
  attributes: Record<string, string>;
  children: Map<string, ElementContext[]>;
  parent?: ElementContext;
}

export function parseXML(stream: Readable, schema: ElementSchema): Promise<ParsedResult> {
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(true, { lowercase: true });
    const results: ParsedObject[] = [];
    let currentElement: ElementContext | undefined;
    let rootElement: ElementContext | undefined;

    parser.on('opentag', (node: sax.Tag | sax.QualifiedTag) => {
      const tagName = node.name.toLowerCase();
      const attrs: Record<string, string> = {};
      if (node.attributes) {
        for (const [key, value] of Object.entries(node.attributes)) {
          attrs[key] = typeof value === 'string' ? value : value.value;
        }
      }
      const newElement: ElementContext = {
        name: tagName,
        text: '',
        attributes: attrs,
        children: new Map(),
        parent: currentElement
      };

      if (tagName === schema.rootElement.toLowerCase()) {
        rootElement = newElement;
      }

      if (currentElement) {
        if (!currentElement.children.has(tagName)) {
          currentElement.children.set(tagName, []);
        }
        currentElement.children.get(tagName)!.push(newElement);
      }

      currentElement = newElement;
    });

    parser.on('text', (text: string) => {
      if (currentElement) {
        currentElement.text += text;
      }
    });

    parser.on('closetag', (tagName: string) => {
      const lowerTagName = tagName.toLowerCase();

      if (lowerTagName === schema.rootElement.toLowerCase() && rootElement) {
        const parsed = extractObject(rootElement, schema);
        if (parsed) {
          results.push(parsed);
        }
        rootElement = undefined;
      }

      if (currentElement?.parent) {
        currentElement = currentElement.parent;
      } else {
        currentElement = undefined;
      }
    });

    parser.on('error', (err: Error) => {
      reject(err);
    });

    parser.on('end', () => {
      resolve(results);
    });

    stream.pipe(parser);
  });
}

export function parseXMLStream(
  stream: Readable,
  schema: ElementSchema,
  onToy: (toy: ParsedObject) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(true, { lowercase: true });
    let currentElement: ElementContext | undefined;
    let rootElement: ElementContext | undefined;

    parser.on('opentag', (node: sax.Tag | sax.QualifiedTag) => {
      const tagName = node.name.toLowerCase();
      const attrs: Record<string, string> = {};
      if (node.attributes) {
        for (const [key, value] of Object.entries(node.attributes)) {
          attrs[key] = typeof value === 'string' ? value : value.value;
        }
      }
      const newElement: ElementContext = {
        name: tagName,
        text: '',
        attributes: attrs,
        children: new Map(),
        parent: currentElement
      };

      if (tagName === schema.rootElement.toLowerCase()) {
        rootElement = newElement;
      }

      if (currentElement) {
        if (!currentElement.children.has(tagName)) {
          currentElement.children.set(tagName, []);
        }
        currentElement.children.get(tagName)!.push(newElement);
      }

      currentElement = newElement;
    });

    parser.on('text', (text: string) => {
      if (currentElement) {
        currentElement.text += text;
      }
    });

    parser.on('closetag', (tagName: string) => {
      const lowerTagName = tagName.toLowerCase();

      if (lowerTagName === schema.rootElement.toLowerCase() && rootElement) {
        const parsed = extractObject(rootElement, schema);
        if (parsed) {
          onToy(parsed);
        }
        rootElement = undefined;
      }

      if (currentElement?.parent) {
        currentElement = currentElement.parent;
      } else {
        currentElement = undefined;
      }
    });

    parser.on('error', (err: Error) => {
      reject(err);
    });

    parser.on('end', () => {
      resolve();
    });

    stream.pipe(parser);
  });
}

function extractObject(element: ElementContext, schema: ElementSchema): ParsedObject | null {
  const result: ParsedObject = {};

  for (const field of schema.fields) {
    const value = extractField(element, field);
    if (value !== undefined) {
      result[field.name] = value;
    }
  }

  return result;
}

function extractField(element: ElementContext, field: FieldSchema): ParsedValue | undefined {
  const childElements = element.children.get(field.name);

  if (field.type === 'text') {
    const child = childElements?.[0];
    if (child) {
      return child.text.trim();
    }
    return undefined;
  }

  if (field.type === 'object') {
    const child = childElements?.[0];
    if (!child) {
      return undefined;
    }
    const obj: ParsedObject = {};
    for (const subField of field.fields) {
      const value = extractField(child, subField);
      if (value !== undefined) {
        obj[subField.name] = value;
      }
    }
    return obj;
  }

  if (field.type === 'array') {
    if (!childElements || childElements.length === 0) {
      return undefined;
    }
    const array: ParsedValue[] = [];
    for (const child of childElements) {
      const item: ParsedObject = {};
      for (const subField of field.itemSchema) {
        const value = extractField(child, subField);
        if (value !== undefined) {
          item[subField.name] = value;
        }
      }
      array.push(item);
    }
    return array;
  }

  return undefined;
}
