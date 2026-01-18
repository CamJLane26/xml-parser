import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { uploadMiddleware } from './middleware/upload';
import { parseXMLStream } from './parsers/xmlParser';
import { toySchema } from './config/toySchema';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as sax from 'sax';
import { getClient, insertToysBatch, closePool } from './db/postgres';

const app = express();
const PORT = process.env.PORT || 3000;
const BATCH_SIZE = parseInt(process.env.DB_BATCH_SIZE || '100', 10);
const MAX_BATCH_SIZE = BATCH_SIZE * 2; // Safety limit to prevent runaway batches
const BATCH_FLUSH_INTERVAL_MS = parseInt(process.env.BATCH_FLUSH_INTERVAL_MS || '5000', 10); // Flush batch after 5 seconds
const USE_DATABASE = process.env.USE_DATABASE !== 'false'; // Default to true, set to 'false' to disable

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Counts the number of first-level 'toy' elements in an XML file
 * First-level means direct children of the root element
 */
function countFirstLevelToys(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(true, { lowercase: true });
    let depth = -1; // Start at -1, will be 0 when root opens
    let firstLevelToyCount = 0;
    let insideRoot = false;

    parser.on('opentag', (node: sax.Tag | sax.QualifiedTag) => {
      const tagName = node.name.toLowerCase();
      
      depth++;
      
      // When we open the root element (e.g., <toys>), depth becomes 0
      if (depth === 0) {
        insideRoot = true;
      }
      
      // If we're at depth 1 (direct child of root) and it's a 'toy' element
      if (insideRoot && depth === 1 && tagName === 'toy') {
        firstLevelToyCount++;
      }
    });

    parser.on('closetag', (tagName: string) => {
      if (insideRoot) {
        depth--;
        // If we close the root element, we're done
        if (depth < 0) {
          insideRoot = false;
        }
      }
    });

    parser.on('error', (err: Error) => {
      reject(err);
    });

    parser.on('end', () => {
      resolve(firstLevelToyCount);
    });

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(parser);
  });
}

app.get('/health', (req: Request, res: Response): void => {
  res.json({ status: 'ok' });
});

app.get('/', (req: Request, res: Response): void => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/parse', uploadMiddleware, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const filePath = (req as any).filePath as string;
  let fileStream: Readable | undefined;
  // @ts-ignore
  let dbClient = null;
  const batchId = `batch-${Date.now()}-${Math.round(Math.random() * 1E9)}`;

  console.log(`[Upload] File saved to: ${filePath}`);
  console.log(`[Parse] Starting parse with batch ID: ${batchId}`);

  try {
    // Count first-level toy elements
    const firstLevelToyCount = await countFirstLevelToys(filePath);
    console.log(`[Upload] Found ${firstLevelToyCount} first-level 'toy' element(s) in the uploaded file`);
    
    // Create a fresh stream for parsing (the counting function may have consumed the original stream)
    fileStream = fs.createReadStream(filePath);
    if (!fileStream) {
      res.status(400).json({ error: 'No file stream available' });
      return;
    }

    // Set up Server-Sent Events for progress updates
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    const sendProgress = (progress: number, current: number, total: number): void => {
      res.write(`data: ${JSON.stringify({ progress, current, total })}\n\n`);
    };

    // Send initial progress with total count
    sendProgress(0, 0, firstLevelToyCount);

    // Get database client and start transaction (if database is enabled)
    if (USE_DATABASE) {
      try {
        dbClient = await getClient();
        await dbClient.query('BEGIN');
      } catch (dbError) {
        console.warn('[Parse] Database connection failed, continuing without database:', dbError);
        // Continue without database for local testing
      }
    }

    let toyCount = 0;
    const sampleToys: any[] = [];
    let batch: any[] = [];
    let lastProgressSent = -1;
    let lastBatchInsertTime = Date.now();

    await parseXMLStream(fileStream, toySchema, async (toy) => {
      toyCount++;
      
      // Safety check: prevent batch from growing too large
      if (batch.length >= MAX_BATCH_SIZE) {
        console.warn(`[Parse] Batch size exceeded ${MAX_BATCH_SIZE}, forcing insert to prevent memory issues`);
        // @ts-ignore
        if (USE_DATABASE && dbClient) {
          try {
            await insertToysBatch(dbClient, batch, batchId);
            batch = [];
            lastBatchInsertTime = Date.now();
          } catch (dbError) {
            console.error('[Parse] Forced batch insert error:', dbError);
            // Clear batch even on error to prevent memory issues
            batch = [];
          }
        } else {
          // If database disabled, clear batch anyway
          batch = [];
        }
      }
      
      batch.push(toy);

      // Collect sample toys
      if (sampleToys.length < 20) {
        const toyCopy = JSON.parse(JSON.stringify(toy));
        sampleToys.push(toyCopy);
      }

      // Check if we need to flush based on time (prevent stale batches)
      const timeSinceLastInsert = Date.now() - lastBatchInsertTime;
      const shouldFlushByTime = batch.length > 0 && timeSinceLastInsert >= BATCH_FLUSH_INTERVAL_MS;

      // Insert batch when it reaches the batch size or time limit (if database is enabled)
      // @ts-ignore
      if (USE_DATABASE && dbClient && (batch.length >= BATCH_SIZE || shouldFlushByTime)) {
        try {
          await insertToysBatch(dbClient, batch, batchId);
          batch = [];
          lastBatchInsertTime = Date.now();
        } catch (dbError) {
          console.error('[Parse] Database insert error:', dbError);
          // Always clear batch on error to prevent memory accumulation
          batch = [];
          // Continue parsing even if database insert fails
        }
      }

      // Calculate and send progress updates
      if (firstLevelToyCount > 0) {
        const progressPercent = Math.min(100, Math.floor((toyCount / firstLevelToyCount) * 100));
        // Send progress update when percentage changes or every 1000 toys
        if (progressPercent !== lastProgressSent || toyCount % 1000 === 0) {
          sendProgress(progressPercent, toyCount, firstLevelToyCount);
          lastProgressSent = progressPercent;
        }
      } else {
        // If we don't know the total, still send updates periodically
        if (toyCount % 1000 === 0) {
          sendProgress(0, toyCount, 0);
        }
      }

      if (toyCount % 100000 === 0) {
        console.log(`[Parse] Processed ${toyCount.toLocaleString()} toys...`);
        if (global.gc) {
          global.gc();
        }
      }
    });

    // Insert remaining toys in batch (if database is enabled)
    if (USE_DATABASE && dbClient && batch.length > 0) {
      try {
        await insertToysBatch(dbClient, batch, batchId);
      } catch (dbError) {
        console.error('[Parse] Database insert error:', dbError);
      }
    }

    // Commit transaction (if database is enabled)
    if (USE_DATABASE && dbClient) {
      try {
        await dbClient.query('COMMIT');
        console.log(`[Parse] Successfully inserted ${toyCount.toLocaleString()} toys into database`);
      } catch (dbError) {
        console.error('[Parse] Database commit error:', dbError);
        try {
          await dbClient.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('[Parse] Error during rollback:', rollbackError);
        }
      }
    } else {
      console.log(`[Parse] Parsed ${toyCount.toLocaleString()} toys (database disabled)`);
    }

    // Send final progress and result
    sendProgress(100, toyCount, firstLevelToyCount);
    res.write(`data: ${JSON.stringify({ 
      done: true, 
      count: toyCount, 
      sample: sampleToys
    })}\n\n`);
    res.end();
  } catch (error) {
    // Rollback transaction on error (if database is enabled)
    if (USE_DATABASE && dbClient) {
      try {
        await dbClient.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('[Parse] Error during rollback:', rollbackError);
      }
    }
    
    // Send error via SSE before ending
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Parse] Error:', errorMessage);
    res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
    res.end();
    next(error);
  } finally {
    // Release database client
    if (dbClient) {
      dbClient.release();
    }
    
    // Clean up temporary file
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkError) {
        console.error('[Parse] Error deleting temp file:', unlinkError);
      }
    }
  }
});

app.use((err: Error, req: Request, res: Response, next: NextFunction): void => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database pool...');
  if (USE_DATABASE) {
    await closePool();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing database pool...');
  if (USE_DATABASE) {
    await closePool();
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (USE_DATABASE) {
    console.log(`Database mode: ENABLED`);
  } else {
    console.log(`Database mode: DISABLED (local testing mode)`);
  }
});
