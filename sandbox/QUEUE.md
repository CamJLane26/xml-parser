# Parse Queue System

To handle large XML files efficiently and prevent memory issues with concurrent uploads, xml-parser uses an **in-memory queue** that processes one file at a time.

## How It Works

### Queue Behavior

- **Concurrency**: 1 file at a time
- **Processing**: FIFO (First In, First Out)
- **Memory**: Only one large file in memory during parsing
- **User Experience**: Multiple users can upload simultaneously; files are queued automatically

### Upload Flow

```
User A uploads → Processing immediately
User B uploads → Queued (position 2)  
User C uploads → Queued (position 3)
```

When User A's file finishes, User B's file starts automatically.

## User Experience

### When Uploading

**First in queue (no wait):**
```
Uploading and analyzing file...
[Progress bar shows normal parsing]
```

**Queued (waiting):**
```
In queue. Position: 2. Processing will start soon...
[Then switches to normal progress when processing starts]
```

### SSE Messages

Clients receive Server-Sent Events throughout the process:

**Queue Position (if waiting):**
```json
{
  "queued": true,
  "position": 2,
  "message": "In queue. Position: 2. Processing will start soon..."
}
```

**Progress Updates (during parsing):**
```json
{
  "progress": 50,
  "current": 5000,
  "total": 10000
}
```

**Completion:**
```json
{
  "done": true,
  "count": 10000,
  "sample": [...]
}
```

## Monitoring

### Health Endpoint

Check queue status:
```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "queue": {
    "length": 2,     // Jobs waiting
    "running": 1,    // Jobs currently processing
    "idle": false    // Whether queue is empty
  }
}
```

### Server Logs

The queue logs key events:

**Job Added:**
```
[Upload] File saved to: /path/to/file.xml
[Queue] Current queue length: 2
[Queue] Adding job to queue (batch ID: batch-1234...)
```

**Processing Starts:**
```
[Queue] Starting processing (queue length: 1, running: 1)
[Queue] Processing file: /path/to/file.xml
```

**Processing Completes:**
```
[Queue] Finished processing (queue length: 0, running: 0)
```

**Queue Empty:**
```
[Queue] All jobs processed, queue is now empty
```

## Configuration

### Queue Settings

Currently hardcoded in `server.ts`:

```typescript
const parseQueue = asyncQueue(async (job) => {
  await processParseJob(job);
}, 1); // concurrency = 1
```

**To change concurrency** (not recommended for large files):
```typescript
}, 2); // Allow 2 concurrent files
```

### Memory Considerations

**Why concurrency = 1?**
- Large XML files (100MB-1GB) consume significant memory
- Parsing uses 200-600MB heap space
- Processing 2+ files simultaneously could exceed heap limit
- Queue ensures predictable memory usage

**Example:**
- Single 500MB file: ~400MB heap ✅
- Two 500MB files: ~800MB heap ⚠️ (may cause issues)

## Implementation Details

### Queue Library

Uses [`async`](https://caolan.github.io/async/v3/docs.html#queue) library:

```typescript
import { queue as asyncQueue, QueueObject } from 'async';

interface ParseJob {
  req: Request;
  res: Response;
  next: NextFunction;
  filePath: string;
  batchId: string;
}

const parseQueue: QueueObject<ParseJob> = asyncQueue(
  async (job) => await processParseJob(job),
  1
);
```

### Error Handling

- Failed jobs are logged but don't block the queue
- Subsequent jobs continue processing
- Temporary files are cleaned up on success or failure

### Connection Management

- SSE connection opened immediately on upload
- Client waits for queue position (if any)
- Connection stays open during entire parse
- Supports standard HTTP timeout handling

## Testing

### Single Upload

```bash
# Upload a file
curl -X POST -F "xmlfile=@test.xml" http://localhost:3000/parse
```

### Concurrent Uploads

Test queue behavior with multiple simultaneous uploads:

```bash
# Terminal 1
curl -X POST -F "xmlfile=@large1.xml" http://localhost:3000/parse &

# Terminal 2 (immediately after)
curl -X POST -F "xmlfile=@large2.xml" http://localhost:3000/parse &

# Terminal 3 (immediately after)
curl -X POST -F "xmlfile=@large3.xml" http://localhost:3000/parse &
```

Expected behavior:
- First upload processes immediately
- Second and third show "In queue" message
- All complete successfully in order

### Monitor Queue

While files are uploading:

```bash
watch -n 1 'curl -s http://localhost:3000/health | jq'
```

## Limitations

### Current Implementation

- **In-memory**: Queue lost if server restarts
- **Single server**: Doesn't scale across multiple instances
- **No priority**: All jobs treated equally (FIFO)
- **No timeouts**: Long-running jobs block queue

### When to Upgrade

Consider Bull + Redis if you need:
- **Persistence**: Queue survives server restarts
- **Multi-server**: Load balance across multiple instances
- **Priority queues**: VIP users jump the queue
- **Job retry**: Automatic retry on failure
- **Advanced monitoring**: Web UI for queue management

See parent README for Redis-based queue implementation.

## Troubleshooting

### Jobs Not Processing

Check queue status:
```bash
curl http://localhost:3000/health
```

If `running: 0` and `length > 0`, jobs are stuck. Restart server.

### Long Wait Times

Queue length > 5 may indicate:
- Very large files taking a long time
- Need to scale horizontally (multiple server instances)
- Consider implementing job timeouts

### Memory Issues During Queue

If memory issues occur even with queue:
- Reduce `NODE_HEAP_SIZE`
- Verify only 1 concurrent job (`concurrency: 1`)
- Check for memory leaks in parser
- Monitor with memory logs every 100K records

## Performance

### Throughput

With 1GB XML files:
- Processing time: 6-10 minutes per file
- Queue throughput: ~6-10 files per hour
- Memory stable at 200-600MB per file

### Scaling

**Horizontal scaling** (recommended for high load):
- Deploy multiple server instances
- Use load balancer
- Each instance has its own queue
- Upgrade to Redis-based queue for coordination

**Vertical scaling** (not recommended):
- Increase `NODE_HEAP_SIZE` to 16GB+
- Increase concurrency to 2-3
- Risk of memory issues
- Less predictable behavior
