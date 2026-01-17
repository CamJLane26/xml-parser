# XML Generator Sandbox

This directory contains utilities for generating sample XML files for testing.

## generateXml.ts

Generates XML files that match the toy schema with random data.

### Usage

1. Edit the `NUM_TOYS` constant in `generateXml.ts` to set the number of toy objects you want
2. Run the generator:
   ```bash
   npm run generate-xml
   ```
   Or directly:
   ```bash
   npx ts-node sandbox/generateXml.ts
   ```

### Output

The script generates a `sample.xml` file in the `sandbox` directory with:
- Random toy names (Brick, Ball, Car, etc.)
- Random colors (Red, Blue, Green, etc.)
- 1-3 random stores per toy with:
  - Random store names (Target, Walmart, etc.)
  - Random locations (Texas, California, etc.)

### Customization

To change the number of toys, edit the `NUM_TOYS` constant at the bottom of `generateXml.ts`:

```typescript
const NUM_TOYS = 10; // Change this number
```

You can also customize the random data by modifying the arrays:
- `colors` - Available toy colors
- `toyNames` - Available toy names
- `storeNames` - Available store names
- `locations` - Available store locations
