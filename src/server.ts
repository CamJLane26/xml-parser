import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { uploadMiddleware } from './middleware/upload';
import { parseXMLStream } from './parsers/xmlParser';
import { toySchema } from './config/toySchema';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as os from 'os';
import * as sax from 'sax';

const app = express();
const PORT = process.env.PORT || 3000;
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), 'storage');

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
  
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
  
  const outputPath = path.join(STORAGE_DIR, `parsed-${Date.now()}-${Math.round(Math.random() * 1E9)}.json`);

  console.log(`[Upload] File saved to: ${filePath}`);
  console.log(`[Parse] Output will be saved to: ${outputPath}`);

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

    const writeStream = fs.createWriteStream(outputPath, { highWaterMark: 16 * 1024 });
    writeStream.write('{"toys":[');

    let isFirst = true;
    let toyCount = 0;
    const sampleToys: any[] = [];
    let pendingWrites: Promise<void>[] = [];
    let isDraining = false;
    let lastProgressSent = -1;

    const queueWrite = (data: string): void => {
      if (writeStream.write(data)) {
        return;
      }
      
      if (!isDraining) {
        isDraining = true;
        const promise = new Promise<void>((resolve) => {
          writeStream.once('drain', () => {
            isDraining = false;
            resolve();
          });
        });
        pendingWrites.push(promise);
      }
    };

    await parseXMLStream(fileStream, toySchema, (toy) => {
      toyCount++;
      
      if (!isFirst) {
        queueWrite(',');
      } else {
        isFirst = false;
      }
      
      const toyJson = JSON.stringify(toy);
      queueWrite(toyJson);

      if (sampleToys.length < 20) {
        const toyCopy = JSON.parse(JSON.stringify(toy));
        sampleToys.push(toyCopy);
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

    if (pendingWrites.length > 0) {
      await Promise.all(pendingWrites);
    }

    writeStream.write(']}');
    writeStream.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
    });

    // Send final progress and result
    sendProgress(100, toyCount, firstLevelToyCount);
    res.write(`data: ${JSON.stringify({ 
      done: true, 
      count: toyCount, 
      sample: sampleToys, 
      downloadUrl: `/download/${path.basename(outputPath)}` 
    })}\n\n`);
    res.end();

    (req as any).outputPath = outputPath;
  } catch (error) {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    // Send error via SSE before ending
    res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`);
    res.end();
    next(error);
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

app.get('/download/:filename', (req: Request, res: Response, next: NextFunction): void => {
  const filenameParam = req.params.filename;
  const filename = typeof filenameParam === 'string' ? filenameParam : filenameParam[0];
  const filePath = path.join(STORAGE_DIR, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);

  fileStream.on('end', () => {
    fs.unlinkSync(filePath);
  });

  fileStream.on('error', (err) => {
    next(err);
  });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction): void => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
