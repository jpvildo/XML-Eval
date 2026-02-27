import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

// Vercel Serverless Function Configuration
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb', // Vercel's maximum payload limit for serverless functions
    },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

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

    res.status(200).json({ text: response.choices[0].message.content });
  } catch (error: any) {
    console.error('OpenAI API Error:', error);
    
    // Check if it's a payload too large error
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Payload too large. Vercel serverless functions have a 4.5MB limit.' });
    }

    res.status(500).json({ error: error.message || 'Failed to communicate with OpenAI' });
  }
}
