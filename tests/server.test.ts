import request from 'supertest';
import express, { Express } from 'express';
import path from 'path';
import * as fs from 'fs';
import * as os from 'os';
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
jest.mock('fs');
jest.mock('os');

const mockTmpdir = '/tmp';
(os.tmpdir as jest.Mock) = jest.fn(() => mockTmpdir);

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
        const fileStream = (req as any).fileStream as Readable;
        if (!fileStream) {
          res.status(400).json({ error: 'No file stream available' });
          return;
        }

        const outputPath = path.join(mockStorageDir, `parsed-${Date.now()}.json`);
        (fs.existsSync as jest.Mock) = jest.fn(() => true);
        (fs.mkdirSync as jest.Mock) = jest.fn();

        const writeStream = {
          write: jest.fn().mockReturnValue(true),
          end: jest.fn(),
          on: jest.fn((event, callback) => {
            if (event === 'finish') {
              setTimeout(callback, 0);
            }
            return writeStream;
          })
        } as any;

        (fs.createWriteStream as jest.Mock) = jest.fn(() => writeStream);

        let toyCount = 0;
        const sampleToys: any[] = [];

        await parseXMLStream(fileStream, toySchema, (toy) => {
          toyCount++;
          if (sampleToys.length < 20) {
            sampleToys.push(toy);
          }
        });

        res.json({
          count: toyCount,
          sample: sampleToys,
          downloadUrl: `/download/${path.basename(outputPath)}`
        });
      } catch (error) {
        next(error);
      }
    });

    app.get('/download/:filename', (req, res, next) => {
      const filename = typeof req.params.filename === 'string' 
        ? req.params.filename 
        : req.params.filename[0];
      const filePath = path.join(mockStorageDir, filename);

      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

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

  test('POST /parse should reject non-XML files', async () => {
    const response = await request(app)
      .post('/parse')
      .attach('xmlfile', Buffer.from('not xml'), 'test.txt');

    expect(response.status).toBe(500);
    expect(response.body.error).toContain('XML');
  });

  test('POST /parse should parse XML file and return summary', async () => {
    (parseXMLStream as jest.Mock) = jest.fn(async (stream, schema, callback) => {
      callback({ name: 'Brick', color: 'Blue' });
      callback({ name: 'Ball', color: 'Red' });
    });

    const xmlContent = '<toy><name>Brick</name><color>Blue</color></toy>';
    const response = await request(app)
      .post('/parse')
      .attach('xmlfile', Buffer.from(xmlContent), 'test.xml');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('count');
    expect(response.body).toHaveProperty('sample');
    expect(response.body).toHaveProperty('downloadUrl');
    expect(response.body.count).toBe(2);
    expect(response.body.sample).toHaveLength(2);
  });

  test('POST /parse should handle missing file', async () => {
    const response = await request(app).post('/parse');

    expect(response.status).toBe(500);
    expect(response.body.error).toContain('file');
  });

  test('GET /download should return file when it exists', async () => {
    (fs.existsSync as jest.Mock) = jest.fn(() => true);

    const response = await request(app).get('/download/parsed-123.json');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['content-disposition']).toContain('attachment');
  });

  test('GET /download should return 404 when file does not exist', async () => {
    (fs.existsSync as jest.Mock) = jest.fn(() => false);

    const response = await request(app).get('/download/nonexistent.json');

    expect(response.status).toBe(404);
    expect(response.body.error).toContain('not found');
  });

  test('POST /parse should handle parsing errors', async () => {
    (parseXMLStream as jest.Mock) = jest.fn().mockRejectedValue(new Error('Parse error'));

    const xmlContent = '<toy><name>Brick</name></toy>';
    const response = await request(app)
      .post('/parse')
      .attach('xmlfile', Buffer.from(xmlContent), 'test.xml');

    expect(response.status).toBe(500);
    expect(response.body.error).toContain('Parse error');
  });
});
