import { ElementSchema } from '../types/schema';

export const toySchema: ElementSchema = {
  rootElement: 'toy',
  fields: [
    { type: 'text', name: 'uuid' },
    { type: 'text', name: 'name' },
    { type: 'text', name: 'color' },
    {
      type: 'object',
      name: 'manufacturer',
      fields: [
        { type: 'text', name: 'name' },
        { type: 'text', name: 'country' }
      ]
    },
    {
      type: 'array',
      name: 'store',
      itemSchema: [
        { type: 'text', name: 'name' },
        { type: 'text', name: 'location' }
      ]
    },
    {
      type: 'object',
      name: 'comments',
      fields: [
        {
          type: 'array',
          name: 'comment',
          itemSchema: [
            { type: 'text', name: 'text' },
            { type: 'text', name: 'author' },
            { type: 'text', name: 'date' }
          ]
        }
      ]
    }
  ]
};
