import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), 'storage');

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, STORAGE_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'xml-upload-' + uniqueSuffix + '.xml');
  }
});

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  if (file.mimetype === 'application/xml' || 
      file.mimetype === 'text/xml' ||
      file.originalname.toLowerCase().endsWith('.xml')) {
    cb(null, true);
  } else {
    cb(new Error('Only XML files are allowed'));
  }
};

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 1024 * 1024 * 1024
  }
}).single('xmlfile');

export const uploadMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  upload(req, res, (err) => {
    if (err) {
      return next(err);
    }
    if (!req.file) {
      return next(new Error('No file uploaded'));
    }
    const filePath = req.file.path;
    (req as any).fileStream = createReadStream(filePath);
    (req as any).filePath = filePath;
    next();
  });
};
