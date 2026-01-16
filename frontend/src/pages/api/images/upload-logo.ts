import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable();
  
  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to parse form data' });
    }

    // console.log('Received files:', files);

    const fileArray = Object.values(files)[0];
    const file = Array.isArray(fileArray) ? fileArray[0] : fileArray as formidable.File;
    
    if (!file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    try {
      const publicDir = path.join(process.cwd(), 'public');
      const destPath = path.join(publicDir, 'resources', 'img', 'logo-mark.png');

      // Ensure directory exists
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

      // Copy the uploaded file to the destination
      await fs.promises.copyFile(file.filepath, destPath);

      // Clean up the temporary file
      await fs.promises.unlink(file.filepath);

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error saving file:', error);
      res.status(500).json({ error: 'Failed to save file' });
    }
  });
} 