import { Readable } from 'stream';
import { parseXMLStream } from '../../src/parsers/xmlParser';
import { ElementSchema } from '../../src/types/schema';

describe('parseXMLStream', () => {
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

  test('should call callback for each toy', async () => {
    const xml = `
      <toys>
        <toy><name>Toy1</name><color>Red</color></toy>
        <toy><name>Toy2</name><color>Blue</color></toy>
      </toys>
    `;
    const stream = createStream(xml);
    const toys: any[] = [];

    await parseXMLStream(stream, toySchema, (toy) => {
      toys.push(toy);
    });

    expect(toys).toHaveLength(2);
    expect(toys[0].name).toBe('Toy1');
    expect(toys[1].name).toBe('Toy2');
  });

  test('should handle nested store arrays', async () => {
    const xml = `
      <toy>
        <name>Brick</name>
        <color>Blue</color>
        <store><name>Target</name><location>Texas</location></store>
        <store><name>Walmart</name><location>Arkansas</location></store>
      </toy>
    `;
    const stream = createStream(xml);
    const toys: any[] = [];

    await parseXMLStream(stream, toySchema, (toy) => {
      toys.push(toy);
    });

    expect(toys).toHaveLength(1);
    expect(toys[0].store).toEqual([
      { name: 'Target', location: 'Texas' },
      { name: 'Walmart', location: 'Arkansas' }
    ]);
  });

  test('should handle empty XML', async () => {
    const xml = '<toys></toys>';
    const stream = createStream(xml);
    const toys: any[] = [];

    await parseXMLStream(stream, toySchema, (toy) => {
      toys.push(toy);
    });

    expect(toys).toHaveLength(0);
  });

  test('should handle malformed XML', async () => {
    const xml = '<toy><name>Brick</name><color>Blue</toy>';
    const stream = createStream(xml);

    await expect(
      parseXMLStream(stream, toySchema, () => {})
    ).rejects.toThrow();
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
    const toys: any[] = [];

    await parseXMLStream(stream, schema, (toy) => {
      toys.push(toy);
    });

    expect(toys).toHaveLength(1);
    expect(toys[0].details).toEqual({
      color: 'Blue',
      size: 'Large'
    });
  });
});
