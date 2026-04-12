import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { crawl } from './crawler.js';
import { generateLlmsTxt } from './generator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

/**
 * GET /api/generate?url=...&maxDepth=3&maxPages=50
 *
 * Server-Sent Events stream. Emits:
 *   event: progress  — { url, pagesFound }
 *   event: done      — { llmsTxt, pagesFound }
 *   event: error     — { message }
 */
app.get('/api/generate', async (req, res) => {
  const { url, maxDepth, maxPages } = req.query as Record<string, string>;

  if (!url) {
    res.status(400).json({ error: 'url query parameter is required' });
    return;
  }

  // Ensure protocol is present
  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  try {
    new URL(normalizedUrl);
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx: disable buffering
  res.flushHeaders();

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const pages = await crawl(normalizedUrl, {
      maxDepth: maxDepth ? Math.min(parseInt(maxDepth, 10), 10) : 3,
      maxPages: maxPages ? Math.min(parseInt(maxPages, 10), 200) : 50,
      onProgress: ({ url: crawledUrl, pagesFound }) => {
        send('progress', { url: crawledUrl, pagesFound });
      },
    });

    const llmsTxt = generateLlmsTxt(pages, normalizedUrl);
    send('done', { llmsTxt, pagesFound: pages.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Crawl failed';
    send('error', { message });
  }

  res.end();
});

app.listen(PORT, () => {
  console.log(`llms.txt generator running at http://localhost:${PORT}`);
});
