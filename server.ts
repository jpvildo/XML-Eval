import express from 'express';
import { createServer as createViteServer } from 'vite';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for large DOCX/XML files
  app.use(express.json({ limit: '50mb' }));

  const kbPath = path.resolve(process.cwd(), 'knowledge_base.md');

  // API routes FIRST
  app.get('/api/kb', (req, res) => {
    try {
      if (!fs.existsSync(kbPath)) {
        return res.send('');
      }
      const content = fs.readFileSync(kbPath, 'utf-8');
      res.send(content);
    } catch (error) {
      console.error('Failed to read KB:', error);
      res.status(500).json({ error: 'Failed to read Knowledge Base' });
    }
  });

  app.post('/api/kb', (req, res) => {
    try {
      const { content } = req.body;
      fs.writeFileSync(kbPath, content, 'utf-8');
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to write KB:', error);
      res.status(500).json({ error: 'Failed to write Knowledge Base' });
    }
  });

  app.post('/api/evaluate/openai', async (req, res) => {
    try {
      const { systemInstruction, prompt, model } = req.body;
      
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'OPENAI_API_KEY environment variable is not set on the server.' });
      }

      const openai = new OpenAI({ apiKey });

      const response = await openai.chat.completions.create({
        model: model || 'gpt-4o',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
      });

      res.json({ text: response.choices[0].message.content });
    } catch (error: any) {
      console.error('OpenAI API Error:', error);
      res.status(500).json({ error: error.message || 'Failed to communicate with OpenAI' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
