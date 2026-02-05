# XML Parser Microservice

A simple Express microservice written in TypeScript that parses XML files with streaming support. The service accepts XML file uploads, extracts data based on a configurable schema, and returns typed JSON responses.

## Features

- Streaming XML parsing using SAX for memory-efficient processing
- **Job queue system**: Processes one large file at a time to prevent memory issues with concurrent uploads
- Configurable schema system for flexible element extraction
- Support for nested elements at arbitrary depths
- Automatic grouping of repeated nested elements into arrays
- Simple web interface for file upload
- Handles large files (up to 1 GB) via streaming
- Real-time progress updates via Server-Sent Events

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
Health check endpoint with queue status:
```json
{
  "status": "ok",
  "queue": {
    "length": 2,
    "running": 1,
    "idle": false
  }
}
```

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
- **Job Queue**: Processes one large file at a time to prevent memory issues (see [QUEUE.md](./QUEUE.md))
- **SAX Parsing**: Event-driven XML parsing for memory-efficient processing
- **Schema-Driven**: Configurable extraction rules for flexibility
- **TypeScript**: Full type safety throughout the codebase

## Queue System

Multiple users can upload files simultaneously. Files are automatically queued and processed one at a time to ensure:
- Predictable memory usage (~200-600MB per file)
- No out-of-memory errors from concurrent large files
- Fair FIFO processing

**User Experience:**
- First upload: processes immediately
- Subsequent uploads: queued with position shown
- Progress updates via Server-Sent Events

📖 **See [QUEUE.md](./QUEUE.md) for detailed queue documentation**

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

## Environment Variables

- `PORT` - Server port (default: 3000)
- `STORAGE_DIR` - Directory for temporary file storage (default: `./storage` in project root)
  - For Kubernetes: Set to a persistent volume mount path (e.g., `/data/storage`)
  - Files are automatically cleaned up after processing/download
- `NODE_HEAP_SIZE` - Node.js heap size in MB (default: 4096 = 4GB)
  - Should be set to ~50-70% of available container memory
  - Example: For 8GB container, use `NODE_HEAP_SIZE=5120` (5GB)
  - Leave room for OS, Node.js overhead, and other processes

## Kubernetes Deployment

For Kubernetes/Rancher deployments:

1. **Persistent Volume**: Mount a persistent volume to `/data/storage` (or your preferred path)
2. **Environment Variables**: 
   ```yaml
   env:
     - name: PORT
       value: "3000"
     - name: STORAGE_DIR
       value: "/data/storage"
     - name: NODE_HEAP_SIZE
       value: "5120"  # 5GB for 8GB container (adjust based on available RAM)
   ```
3. **Resource Limits**: Set appropriate memory limits in your Kubernetes deployment
   - Recommended: Set memory limit to at least 1.5x the heap size
   - Example: For `NODE_HEAP_SIZE=5120`, set memory limit to 8GB

### PersistentVolumeClaim

Create a PersistentVolumeClaim to ensure storage is available:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: xml-parser-storage
  namespace: default  # Change to your namespace
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi  # Adjust size based on your needs
  storageClassName: standard  # Change to your storage class
```

Apply it with:
```bash
kubectl apply -f pvc.yaml
```

### Deployment Example

Example deployment snippet:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: xml-parser
spec:
  replicas: 1
  selector:
    matchLabels:
      app: xml-parser
  template:
    metadata:
      labels:
        app: xml-parser
    spec:
      containers:
      - name: xml-parser
        image: your-registry/xml-parser:latest
        env:
          - name: PORT
            value: "3000"
          - name: STORAGE_DIR
            value: "/data/storage"
          - name: NODE_HEAP_SIZE
            value: "5120"
        volumeMounts:
          - name: storage-volume
            mountPath: /data/storage
        resources:
          limits:
            memory: "8Gi"      # Total container memory limit
          requests:
            memory: "6Gi"      # Memory requested for scheduling
      volumes:
        - name: storage-volume
          persistentVolumeClaim:
            claimName: xml-parser-storage
```

**Note**: 
- `volumeMounts` - Mounts the persistent volume for file storage
- `resources` - Sets CPU/memory limits for the container itself (not related to the volume)
- `volumes` - References the PersistentVolumeClaim created above

## License

ISC
