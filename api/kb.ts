import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const kbPath = path.resolve(process.cwd(), 'knowledge_base.md');

  if (req.method === 'GET') {
    try {
      if (!fs.existsSync(kbPath)) {
        return res.status(200).send('');
      }
      const content = fs.readFileSync(kbPath, 'utf-8');
      res.status(200).send(content);
    } catch (error) {
      console.error('Failed to read KB:', error);
      res.status(500).json({ error: 'Failed to read Knowledge Base' });
    }
  } else if (req.method === 'POST') {
    try {
      const { content } = req.body;
      
      // Attempt to write to the file system
      // WARNING: Vercel serverless functions are read-only in production (except /tmp).
      // This will work locally but will fail on Vercel's production environment.
      // For a production app on Vercel, you should store this in a database (e.g., Vercel KV, Postgres).
      fs.writeFileSync(kbPath, content, 'utf-8');
      res.status(200).json({ success: true, message: 'Saved successfully.' });
    } catch (error: any) {
      console.error('Failed to write KB:', error);
      
      // If deployed on Vercel, the file system is read-only. We catch the error and inform the user gracefully.
      if (error.code === 'EROFS') {
        res.status(403).json({ 
          error: 'Vercel file system is read-only. To save changes permanently on Vercel, you must connect a database.' 
        });
      } else {
        res.status(500).json({ error: 'Failed to write Knowledge Base' });
      }
    }
  } else {
    res.status(405).json({ error: 'Method Not Allowed' });
  }
}
