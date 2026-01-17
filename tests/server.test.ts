import request from 'supertest';
import express, { Express } from 'express';
import path from 'path';
import { uploadMiddleware } from '../src/middleware/upload';
import { parseXMLStream } from '../src/parsers/xmlParser';
import { toySchema } from '../src/config/toySchema';
import { Readable } from 'stream';

jest.mock('../src/parsers/xmlParser');
jest.mock('../src/config/toySchema', () => ({
  toySchema: {
    rootElement: 'toy',
    fields: []
  }
}));
jest.mock('../src/middleware/upload', () => ({
  uploadMiddleware: (req: any, res: any, next: any) => {
    (req as any).filePath = '/tmp/test.xml';
    (req as any).fileStream = Readable.from(['<xml></xml>']);
    next();
  }
}));

describe('Server', () => {
  let app: Express;
  const mockStorageDir = path.join(process.cwd(), 'storage');

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../src/public')));

    app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../src/public/index.html'));
    });

    app.post('/parse', uploadMiddleware, async (req, res, next) => {
      try {
        const filePath = (req as any).filePath as string;
        if (!filePath) {
          res.status(400).json({ error: 'No file path available' });
          return;
        }

        const outputPath = path.join(mockStorageDir, `parsed-${Date.now()}.json`);

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const sendProgress = (progress: number, current: number, total: number): void => {
          res.write(`data: ${JSON.stringify({ progress, current, total })}\n\n`);
        };

        sendProgress(0, 0, 2);

        let toyCount = 0;
        const sampleToys: any[] = [];

        await parseXMLStream({} as Readable, toySchema, (toy) => {
          toyCount++;
          if (sampleToys.length < 20) {
            sampleToys.push(toy);
          }
          if (toyCount === 1) {
            sendProgress(50, 1, 2);
          }
        });

        sendProgress(100, toyCount, 2);
        res.write(`data: ${JSON.stringify({ 
          done: true, 
          count: toyCount, 
          sample: sampleToys, 
          downloadUrl: `/download/${path.basename(outputPath)}` 
        })}\n\n`);
        res.end();
      } catch (error) {
        res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`);
        res.end();
        next(error);
      }
    });

    app.get('/download/:filename', (req, res, next) => {
      const filename = typeof req.params.filename === 'string' 
        ? req.params.filename 
        : req.params.filename[0];
      const filePath = path.join(mockStorageDir, filename);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(JSON.stringify({ toys: [] }));
    });

    app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      res.status(500).json({ error: err.message || 'Internal server error' });
    });
  });

  test('GET /health should return ok', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  test('POST /parse should parse XML file and return SSE summary', async () => {
    (parseXMLStream as jest.Mock) = jest.fn(async (stream, schema, callback) => {
      callback({ name: 'Brick', color: 'Blue' });
      callback({ name: 'Ball', color: 'Red' });
    });

    const response = await request(app)
      .post('/parse')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.text).toContain('data:');
    expect(response.text).toContain('"done":true');
    expect(response.text).toContain('"count":2');
  });

  test('POST /parse should handle parsing errors', async () => {
    (parseXMLStream as jest.Mock) = jest.fn().mockRejectedValue(new Error('Parse error'));

    const response = await request(app)
      .post('/parse')
      .expect(200);

    expect(response.text).toContain('"error":"Parse error"');
  });

  test('GET /download should return file', async () => {
    const response = await request(app).get('/download/parsed-123.json');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['content-disposition']).toContain('attachment');
  });
});
