import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { uploadMiddleware } from './middleware/upload';
import { parseXMLStream } from './parsers/xmlParser';
import { toySchema } from './config/toySchema';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as sax from 'sax';
import { getDb, upsertToysBatch, closeDb, ensureTableExists } from './db/postgres';
import { Toy } from './types/toy';
import { queue as asyncQueue, QueueObject } from 'async';

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration (optimized for large files: 100MB-1GB+)
const BATCH_SIZE = parseInt(process.env.DB_BATCH_SIZE || '100', 10);
const MAX_BATCH_SIZE = BATCH_SIZE * 2; // Safety limit
const BATCH_FLUSH_INTERVAL_MS = parseInt(process.env.BATCH_FLUSH_INTERVAL_MS || '5000', 10);
const USE_DATABASE = process.env.USE_DATABASE !== 'false'; // Default to true

// Parse job interface
interface ParseJob {
  req: Request;
  res: Response | null;
  next: NextFunction;
  filePath: string;
  batchId: string;
  jobId?: string;
  isApi?: boolean;
}

// Create a queue that processes 1 file at a time
const parseQueue: QueueObject<ParseJob> = asyncQueue(async (job: ParseJob) => {
  console.log(`[Queue] Starting processing (queue length: ${parseQueue.length()}, running: ${parseQueue.running()})`);
  await processParseJob(job);
  console.log(`[Queue] Finished processing (queue length: ${parseQueue.length()}, running: ${parseQueue.running()})`);
}, 1); // concurrency = 1 (one file at a time)

// Queue event handlers
parseQueue.error((err, job) => {
  console.error('[Queue] Job failed with error:', err);
});

parseQueue.drain(() => {
  console.log('[Queue] All jobs processed, queue is now empty');
});
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

// Store completed job results temporarily (in production, use Redis)
const jobResults = new Map<string, any>();
const JOB_RESULT_TTL = 3600000; // Keep results for 1 hour

app.get('/health', (req: Request, res: Response): void => {
  res.json({
    status: 'ok',
    queue: {
      length: parseQueue.length(),
      running: parseQueue.running(),
      idle: parseQueue.idle(),
    }
  });
});

app.get('/', (req: Request, res: Response): void => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * API: Upload and parse XML file (returns job ID for polling)
 */
app.post('/api/parse', uploadMiddleware, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const filePath = (req as any).filePath as string;
  const batchId = `batch-${Date.now()}-${Math.round(Math.random() * 1E9)}`;
  const jobId = batchId;

  console.log(`[API] File uploaded: ${filePath}`);
  console.log(`[API] Job ID: ${jobId}`);

  // Initialize job status
  jobResults.set(jobId, {
    id: jobId,
    status: 'queued',
    queuePosition: parseQueue.length() + (parseQueue.running() > 0 ? 1 : 0),
    progress: 0,
    createdAt: new Date().toISOString(),
  });

  // Clean up old job results
  setTimeout(() => {
    jobResults.delete(jobId);
    console.log(`[API] Cleaned up job result: ${jobId}`);
  }, JOB_RESULT_TTL);

  // Add to queue with callback to update status
  parseQueue.push({
    req,
    res: null as any, // No SSE for API endpoint
    next,
    filePath,
    batchId,
    jobId,
    isApi: true,
  } as any);

  // Return job ID immediately
  res.json({
    success: true,
    jobId,
    status: 'queued',
    queuePosition: parseQueue.length(),
    statusUrl: `/api/status/${jobId}`,
    resultUrl: `/api/result/${jobId}`,
  });
});

/**
 * API: Check job status
 */
app.get('/api/status/:jobId', (req: Request, res: Response): void => {
  const jobId = req.params.jobId as string;
  const job = jobResults.get(jobId);

  if (!job) {
    res.status(404).json({
      success: false,
      error: 'Job not found or expired',
    });
    return;
  }

  res.json({
    success: true,
    job,
  });
});

/**
 * API: Get job result (only if completed)
 */
app.get('/api/result/:jobId', (req: Request, res: Response): void => {
  const jobId = req.params.jobId as string;
  const job = jobResults.get(jobId);

  if (!job) {
    res.status(404).json({
      success: false,
      error: 'Job not found or expired',
    });
    return;
  }

  if (job.status !== 'completed') {
    res.status(400).json({
      success: false,
      error: `Job is ${job.status}, not completed`,
      status: job.status,
      progress: job.progress,
    });
    return;
  }

  res.json({
    success: true,
    result: job.result,
  });
});

/**
 * Process a parse job from the queue
 */
async function processParseJob(job: ParseJob): Promise<void> {
  const { req, res, next, filePath, batchId, jobId, isApi } = job;
  let fileStream: Readable | undefined;

  console.log(`[Queue] Processing file: ${filePath}`);
  console.log(`[Parse] Starting parse with batch ID: ${batchId}`);

  // Helper function to update job status (for API)
  const updateJobStatus = (updates: any) => {
    if (isApi && jobId) {
      const current = jobResults.get(jobId) || {};
      jobResults.set(jobId, { ...current, ...updates, updatedAt: new Date().toISOString() });
    }
  };

  // Helper function to send progress (for SSE)
  const sendProgress = (progress: number, current: number, total: number): void => {
    if (res) {
      res.write(`data: ${JSON.stringify({ progress, current, total })}\n\n`);
    }
    if (isApi) {
      updateJobStatus({ progress, current, total, status: 'processing' });
    }
  };

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
      if (res) {
        res.status(400).json({ error: 'No file stream available' });
      } else if (isApi) {
        updateJobStatus({ status: 'failed', error: 'No file stream available' });
      }
      return;
    }

    // Set up Server-Sent Events for progress updates (if not API mode)
    if (res) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
    }

    // Send initial progress with total count
    sendProgress(0, 0, firstLevelToyCount);
    if (isApi) {
      updateJobStatus({ status: 'processing', totalRecords: firstLevelToyCount });
    }

    // Ensure table exists (if database is enabled)
    if (USE_DATABASE) {
      try {
        await ensureTableExists();
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
        if (USE_DATABASE) {
          try {
            await upsertToysBatch(batch);
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

      // Upsert batch when it reaches the batch size or time limit (if database is enabled)
      if (USE_DATABASE && (batch.length >= BATCH_SIZE || shouldFlushByTime)) {
        try {
          await upsertToysBatch(batch);
          batch = [];
          lastBatchInsertTime = Date.now();
        } catch (dbError) {
          console.error('[Parse] Database upsert error:', dbError);
          // Always clear batch on error to prevent memory accumulation
          batch = [];
          // Continue parsing even if database upsert fails
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

    // Upsert remaining toys in batch (if database is enabled)
    if (USE_DATABASE && batch.length > 0) {
      try {
        await upsertToysBatch(batch);
      } catch (dbError) {
        console.error('[Parse] Database upsert error:', dbError);
      }
    }

    if (USE_DATABASE) {
      console.log(`[Parse] Successfully upserted ${toyCount.toLocaleString()} toys into database`);
    } else {
      console.log(`[Parse] Parsed ${toyCount.toLocaleString()} toys (database disabled)`);
    }

    // Send final progress and result
    sendProgress(100, toyCount, firstLevelToyCount);

    const finalResult = {
      done: true,
      count: toyCount,
      sample: sampleToys
    };

    if (res) {
      res.write(`data: ${JSON.stringify(finalResult)}\n\n`);
      res.end();
    }

    if (isApi) {
      updateJobStatus({
        status: 'completed',
        progress: 100,
        result: finalResult,
        completedAt: new Date().toISOString(),
      });
    }
  } catch (error) {

    // Send error via SSE before ending
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Parse] Error:', errorMessage);
    console.error('[Parse] Parsing failed - cleaning up temporary file');

    if (res) {
      res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
      res.end();
    }

    if (isApi) {
      updateJobStatus({
        status: 'failed',
        error: errorMessage,
        failedAt: new Date().toISOString(),
      });
    }

    if (next) next(error);
  } finally {
    // Clean up temporary file (always executes, even on error)
    cleanupFile();
  }
}

app.post('/parse', uploadMiddleware, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const filePath = (req as any).filePath as string;
  const batchId = `batch-${Date.now()}-${Math.round(Math.random() * 1E9)}`;

  console.log(`[Upload] File saved to: ${filePath}`);
  console.log(`[Queue] Current queue length: ${parseQueue.length()}`);
  console.log(`[Queue] Adding job to queue (batch ID: ${batchId})`);

  // Set up Server-Sent Events immediately
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Send queue position info
  const queuePosition = parseQueue.length() + (parseQueue.running() > 0 ? 1 : 0);
  if (queuePosition > 1) {
    res.write(`data: ${JSON.stringify({
      queued: true,
      position: queuePosition,
      message: `In queue. Position: ${queuePosition}. Processing will start soon...`
    })}\n\n`);
  }

  // Add job to queue
  parseQueue.push({
    req,
    res,
    next,
    filePath,
    batchId,
  });
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
      await closeDb();
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
      await closeDb();
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
    await closeDb();
  }
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason: any) => {
  console.error('UNHANDLED REJECTION! Shutting down...');
  console.error(reason);

  if (USE_DATABASE) {
    await closeDb();
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database pool...');
  if (USE_DATABASE) {
    await closeDb();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing database pool...');
  if (USE_DATABASE) {
    await closeDb();
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
