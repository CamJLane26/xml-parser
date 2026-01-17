import { ElementSchema } from '../types/schema';

export const toySchema: ElementSchema = {
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
