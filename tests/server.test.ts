import request from 'supertest';
import express, { Express } from 'express';
import path from 'path';
import { uploadMiddleware } from '../src/middleware/upload';
import { parseXML } from '../src/parsers/xmlParser';
import { toySchema } from '../src/config/toySchema';
import { Readable } from 'stream';

jest.mock('../src/parsers/xmlParser');
jest.mock('../src/config/toySchema', () => ({
  toySchema: {
    rootElement: 'toy',
    fields: []
  }
}));

describe('Server', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../src/public')));

    app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    app.post('/parse', uploadMiddleware, async (req, res, next) => {
      try {
        const fileStream = (req as any).fileStream as Readable;
        if (!fileStream) {
          res.status(400).json({ error: 'No file stream available' });
          return;
        }

        const toys = await parseXML(fileStream, toySchema);
        res.json({ toys });
      } catch (error) {
        next(error);
      }
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

  test('POST /parse should parse XML file', async () => {
    (parseXML as jest.Mock).mockResolvedValue([
      { name: 'Brick', color: 'Blue' }
    ]);

    const xmlContent = '<toy><name>Brick</name><color>Blue</color></toy>';
    const response = await request(app)
      .post('/parse')
      .attach('xmlfile', Buffer.from(xmlContent), 'test.xml');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('toys');
    expect(parseXML).toHaveBeenCalled();
  });

  test('POST /parse should handle missing file', async () => {
    const response = await request(app).post('/parse');

    expect(response.status).toBe(500);
    expect(response.body.error).toContain('file');
  });
});
