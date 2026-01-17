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
});
