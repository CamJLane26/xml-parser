import { Readable } from 'stream';
import { parseXML } from '../../src/parsers/xmlParser';
import { ElementSchema } from '../../src/types/schema';

describe('xmlParser', () => {
  const createStream = (xml: string): Readable => {
    return Readable.from([xml]);
  };

  const toySchema: ElementSchema = {
    rootElement: 'toy',
    fields: [
      { type: 'text', name: 'name' },
      { type: 'text', name: 'color' },
      {
        type: 'array',
        name: 'store',
        itemSchema: [
          { type: 'text', name: 'name' },
          { type: 'text', name: 'location' }
        ]
      }
    ]
  };

  test('should parse simple toy with text fields', async () => {
    const xml = '<toy><name>Brick</name><color>Blue</color></toy>';
    const stream = createStream(xml);
    const result = await parseXML(stream, toySchema);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'Brick',
      color: 'Blue'
    });
  });

  test('should parse toy with nested store array', async () => {
    const xml = `
      <toy>
        <name>Brick</name>
        <color>Blue</color>
        <store><name>Target</name><location>Texas</location></store>
        <store><name>Walmart</name><location>Arkansas</location></store>
      </toy>
    `;
    const stream = createStream(xml);
    const result = await parseXML(stream, toySchema);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Brick');
    expect(result[0].color).toBe('Blue');
    expect(result[0].store).toEqual([
      { name: 'Target', location: 'Texas' },
      { name: 'Walmart', location: 'Arkansas' }
    ]);
  });

  test('should parse multiple toys', async () => {
    const xml = `
      <toys>
        <toy><name>Toy1</name><color>Red</color></toy>
        <toy><name>Toy2</name><color>Green</color></toy>
      </toys>
    `;
    const stream = createStream(xml);
    const result = await parseXML(stream, toySchema);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Toy1');
    expect(result[1].name).toBe('Toy2');
  });

  test('should handle empty store array', async () => {
    const xml = '<toy><name>Brick</name><color>Blue</color></toy>';
    const stream = createStream(xml);
    const result = await parseXML(stream, toySchema);

    expect(result).toHaveLength(1);
    expect(result[0].store).toBeUndefined();
  });

  test('should handle malformed XML', async () => {
    const xml = '<toy><name>Brick</name><color>Blue</toy>';
    const stream = createStream(xml);

    await expect(parseXML(stream, toySchema)).rejects.toThrow();
  });

  test('should handle object field type', async () => {
    const schema: ElementSchema = {
      rootElement: 'toy',
      fields: [
        { type: 'text', name: 'name' },
        {
          type: 'object',
          name: 'details',
          fields: [
            { type: 'text', name: 'color' },
            { type: 'text', name: 'size' }
          ]
        }
      ]
    };

    const xml = '<toy><name>Brick</name><details><color>Blue</color><size>Large</size></details></toy>';
    const stream = createStream(xml);
    const result = await parseXML(stream, schema);

    expect(result).toHaveLength(1);
    expect(result[0].details).toEqual({
      color: 'Blue',
      size: 'Large'
    });
  });

  test('should handle deeply nested elements', async () => {
    const schema: ElementSchema = {
      rootElement: 'toy',
      fields: [
        { type: 'text', name: 'name' },
        {
          type: 'object',
          name: 'category',
          fields: [
            { type: 'text', name: 'type' },
            {
              type: 'object',
              name: 'subcategory',
              fields: [
                { type: 'text', name: 'name' }
              ]
            }
          ]
        }
      ]
    };

    const xml = '<toy><name>Brick</name><category><type>Building</type><subcategory><name>Blocks</name></subcategory></category></toy>';
    const stream = createStream(xml);
    const result = await parseXML(stream, schema);

    expect(result).toHaveLength(1);
    const category = result[0].category as any;
    expect(category.subcategory.name).toBe('Blocks');
  });

  test('should handle XML with attributes', async () => {
    const xml = '<toy id="123"><name>Brick</name><color>Blue</color></toy>';
    const stream = createStream(xml);
    const result = await parseXML(stream, toySchema);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Brick');
  });

  test('should handle empty root element', async () => {
    const xml = '<toy></toy>';
    const stream = createStream(xml);
    const result = await parseXML(stream, toySchema);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBeUndefined();
  });
});
