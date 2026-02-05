import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { uploadMiddleware } from './middleware/upload';
import { parseXMLStream } from './parsers/xmlParser';
import { toySchema } from './config/toySchema';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as sax from 'sax';
import { getClient, insertToysBatch, closePool } from './db/postgres';
import { Toy } from './types/toy';

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration (optimized for large files: 100MB-1GB+)
const BATCH_SIZE = parseInt(process.env.DB_BATCH_SIZE || '100', 10);
const MAX_BATCH_SIZE = BATCH_SIZE * 2; // Safety limit
const BATCH_FLUSH_INTERVAL_MS = parseInt(process.env.BATCH_FLUSH_INTERVAL_MS || '5000', 10);
const USE_DATABASE = process.env.USE_DATABASE !== 'false'; // Default to true
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), 'storage');
const STORAGE_MAX_AGE_MS = parseInt(process.env.STORAGE_MAX_AGE_MS || '3600000', 10); // 1 hour default

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Clean up old files in storage directory (handles orphaned files from crashes)
 */
function cleanupOldStorageFiles(): void {
  try {
    if (!fs.existsSync(STORAGE_DIR)) {
      return;
    }

    const files = fs.readdirSync(STORAGE_DIR);
    const now = Date.now();
    let cleanedCount = 0;

    for (const file of files) {
      if (!file.startsWith('xml-upload-')) {
        continue; // Skip non-upload files
      }

      const filePath = path.join(STORAGE_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > STORAGE_MAX_AGE_MS) {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      } catch (err) {
        console.error(`[Cleanup] Error processing file ${file}:`, err);
      }
    }

    if (cleanedCount > 0) {
      console.log(`[Cleanup] Removed ${cleanedCount} orphaned file(s) from storage`);
    }
  } catch (err) {
    console.error('[Cleanup] Error cleaning storage directory:', err);
  }
}

// Clean up orphaned files on startup
cleanupOldStorageFiles();

const DOCUMENT_HEADER_ELEMENTS = ['date', 'author'];

export interface DocumentHeader {
  date?: string;
  author?: string;
}

/**
 * Counts first-level 'toy' elements and extracts document-level header fields
 * (e.g. <date>, <author>) that appear as direct children of the root.
 * First-level means direct children of the root element.
 */
function countFirstLevelToysAndHeader(filePath: string): Promise<{ firstLevelToyCount: number; header: DocumentHeader }> {
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(true, { lowercase: true });
    let depth = -1;
    let firstLevelToyCount = 0;
    let insideRoot = false;
    let collectingHeader: string | null = null;
    let headerText = '';
    const header: DocumentHeader = {};

    parser.on('opentag', (node: sax.Tag | sax.QualifiedTag) => {
      const tagName = node.name.toLowerCase();

      depth++;

      if (depth === 0) {
        insideRoot = true;
      }

      if (insideRoot && depth === 1) {
        if (DOCUMENT_HEADER_ELEMENTS.includes(tagName) && !(tagName in header)) {
          collectingHeader = tagName;
          headerText = '';
        }
        if (tagName === 'toy') {
          firstLevelToyCount++;
        }
      }
    });

    parser.on('text', (text: string) => {
      if (collectingHeader) {
        headerText += text;
      }
    });

    parser.on('closetag', (tagName: string) => {
      const lowerTagName = tagName.toLowerCase();
      if (insideRoot && depth === 1 && collectingHeader === lowerTagName) {
        const value = headerText.trim();
        if (lowerTagName === 'date') header.date = value;
        if (lowerTagName === 'author') header.author = value;
        collectingHeader = null;
        headerText = '';
      }
      if (insideRoot) {
        depth--;
        if (depth < 0) {
          insideRoot = false;
        }
      }
    });

    parser.on('error', (err: Error) => {
      reject(err);
    });

    parser.on('end', () => {
      resolve({ firstLevelToyCount, header });
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

  // Helper function to clean up temporary file
  const cleanupFile = () => {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`[Cleanup] Deleted temporary file: ${filePath}`);
      } catch (unlinkError) {
        console.error('[Cleanup] Error deleting temp file:', unlinkError);
      }
    }
  };

  try {
    // Count first-level toy elements and extract document-level header (date, author)
    const { firstLevelToyCount, header: documentHeader } = await countFirstLevelToysAndHeader(filePath);
    console.log(`[Upload] Found ${firstLevelToyCount} first-level 'toy' element(s) in the uploaded file`);
    if (documentHeader.date != null || documentHeader.author != null) {
      console.log(`[Upload] Document header: date=${documentHeader.date ?? '(none)'}, author=${documentHeader.author ?? '(none)'}`);
    }
    
    // Create a fresh stream for parsing (the counting function may have consumed the original stream)
    fileStream = fs.createReadStream(filePath);
    if (!fileStream) {
      cleanupFile(); // Clean up before returning
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
    const sampleToys: Toy[] = [];
    let batch: Toy[] = [];
    let lastProgressSent = -1;
    let lastBatchInsertTime = Date.now();

    const mergeDocumentHeader = (toy: Toy): Toy =>
      (documentHeader.date != null || documentHeader.author != null)
        ? { ...toy, ...documentHeader } as Toy
        : toy;

    await parseXMLStream(fileStream, toySchema, async (toy) => {
      toyCount++;
      const toyWithHeader = mergeDocumentHeader(toy);

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
      
      batch.push(toyWithHeader);

      // Collect sample toys
      if (sampleToys.length < 20) {
        const toyCopy = JSON.parse(JSON.stringify(toyWithHeader));
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

      // Trigger manual GC every 100K records (--expose-gc flag in package.json)
      if (toyCount % 100000 === 0) {
        console.log(`[Parse] Processed ${toyCount.toLocaleString()} toys...`);
        if (global.gc) {
          global.gc();
          const memUsage = process.memoryUsage();
          console.log(`[Memory] Heap: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB / ${(memUsage.heapTotal / 1024 / 1024).toFixed(1)}MB`);
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
    console.error('[Parse] Parsing failed - cleaning up temporary file');
    res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
    res.end();
    next(error);
  } finally {
    // Release database client
    if (dbClient) {
      dbClient.release();
    }
    
    // Clean up temporary file (always executes, even on error)
    cleanupFile();
  }
});

app.use((err: Error, req: Request, res: Response, next: NextFunction): void => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Handle uncaught exceptions (including heap overflow errors)
process.on('uncaughtException', async (err: Error) => {
  console.error('UNCAUGHT EXCEPTION! Shutting down...');
  console.error(err.name, err.message);
  console.error(err.stack);
  
  // Attempt cleanup before crash
  console.log('[Emergency] Attempting to clean up storage directory...');
  try {
    cleanupOldStorageFiles();
  } catch (cleanupErr) {
    console.error('[Emergency] Cleanup failed:', cleanupErr);
  }
  
  if (USE_DATABASE) {
    try {
      await closePool();
    } catch (poolErr) {
      console.error('[Emergency] Pool close failed:', poolErr);
    }
  }
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason: any) => {
  console.error('UNHANDLED REJECTION! Shutting down...');
  console.error(reason);
  
  if (USE_DATABASE) {
    try {
      await closePool();
    } catch (poolErr) {
      console.error('[Emergency] Pool close failed:', poolErr);
    }
  }
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', async (err: Error) => {
  console.error('UNCAUGHT EXCEPTION! Shutting down...');
  console.error(err.name, err.message);
  console.error(err.stack);
  
  // Clean up storage directory before exiting
  console.log('[Emergency] Cleaning up storage directory...');
  cleanupOldStorageFiles();
  
  if (USE_DATABASE) {
    await closePool();
  }
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason: any) => {
  console.error('UNHANDLED REJECTION! Shutting down...');
  console.error(reason);
  
  if (USE_DATABASE) {
    await closePool();
  }
  process.exit(1);
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
