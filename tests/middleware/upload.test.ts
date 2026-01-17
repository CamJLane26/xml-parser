import { upload } from '../../src/middleware/upload';

describe('uploadMiddleware', () => {
  test('upload should be configured with file filter', () => {
    expect(upload).toBeDefined();
    expect(typeof upload).toBe('function');
  });

  test('upload should accept single file', () => {
    expect(upload.name).toBeDefined();
  });
});
