import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { Readable } from 'stream';

const storage = multer.memoryStorage();

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
    if (req.file.buffer) {
      (req as any).fileStream = Readable.from(req.file.buffer);
    }
    next();
  });
};
