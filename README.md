# XML Parser Microservice

A simple Express microservice written in TypeScript that parses XML files with streaming support. The service accepts XML file uploads, extracts data based on a configurable schema, and returns typed JSON responses.

## Features

- Streaming XML parsing using SAX for memory-efficient processing
- Configurable schema system for flexible element extraction
- Support for nested elements at arbitrary depths
- Automatic grouping of repeated nested elements into arrays
- Simple web interface for file upload
- Handles large files (up to 1 GB) via streaming

## Installation

```bash
npm install
```

## Development

```bash
# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Run production server
npm start

# Run tests
npm test
```

## Usage

1. Start the server:
   ```bash
   npm run dev
   ```

2. Open your browser and navigate to `http://localhost:3000`

3. Select an XML file and click "Parse XML"

4. View the parsed results in JSON format

## API Endpoints

### GET `/`
Serves the HTML upload form.

### GET `/health`
Health check endpoint. Returns `{ status: "ok" }`.

### POST `/parse`
Parses an uploaded XML file.

**Request:**
- Content-Type: `multipart/form-data`
- Field name: `xmlfile`
- File must have `.xml` extension

**Response:**
```json
{
  "toys": [
    {
      "name": "Brick",
      "color": "Blue",
      "store": [
        {
          "name": "Target",
          "location": "Texas"
        }
      ]
    }
  ]
}
```

## Schema Configuration

The service uses a schema-driven approach to extract data from XML. The default schema is configured for `<toy>` elements, but you can customize it in `src/config/toySchema.ts`.

Example schema:
```typescript
{
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
}
```

## Architecture

- **Streaming Architecture**: Files are processed in streams to handle large files efficiently
- **SAX Parsing**: Event-driven XML parsing for memory-efficient processing
- **Schema-Driven**: Configurable extraction rules for flexibility
- **TypeScript**: Full type safety throughout the codebase

## Dependencies

- `express` (<=4.21.2) - Web framework
- `multer` - File upload handling
- `sax-js` - SAX-style XML parser
- `typescript` - TypeScript compiler
- `jest` - Testing framework

## Testing

Unit tests are provided alongside the source code. Run tests with:

```bash
npm test
```

## License

ISC
