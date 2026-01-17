import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { uploadMiddleware } from './middleware/upload';
import { parseXMLStream } from './parsers/xmlParser';
import { toySchema } from './config/toySchema';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as os from 'os';

const app = express();
const PORT = process.env.PORT || 3000;
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), 'storage');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
    fileStream = (req as any).fileStream as Readable;
    if (!fileStream) {
      res.status(400).json({ error: 'No file stream available' });
      return;
    }

    const writeStream = fs.createWriteStream(outputPath, { highWaterMark: 16 * 1024 });
    writeStream.write('{"toys":[');

    let isFirst = true;
    let toyCount = 0;
    const sampleToys: any[] = [];
    let pendingWrites: Promise<void>[] = [];
    let isDraining = false;

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

    res.json({
      count: toyCount,
      sample: sampleToys,
      downloadUrl: `/download/${path.basename(outputPath)}`
    });

    (req as any).outputPath = outputPath;
  } catch (error) {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
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
