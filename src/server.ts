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
  const outputPath = path.join(os.tmpdir(), `parsed-${Date.now()}-${Math.round(Math.random() * 1E9)}.json`);

  try {
    fileStream = (req as any).fileStream as Readable;
    if (!fileStream) {
      res.status(400).json({ error: 'No file stream available' });
      return;
    }

    const writeStream = fs.createWriteStream(outputPath);
    writeStream.write('{"toys":[');

    let isFirst = true;
    let toyCount = 0;
    const sampleToys: any[] = [];

    await parseXMLStream(fileStream, toySchema, (toy) => {
      toyCount++;
      const toyJson = JSON.stringify(toy);
      
      if (isFirst) {
        isFirst = false;
      } else {
        writeStream.write(',');
      }
      writeStream.write(toyJson);

      if (sampleToys.length < 20) {
        sampleToys.push(toy);
      }
    });

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
  const filePath = path.join(os.tmpdir(), filename);

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
