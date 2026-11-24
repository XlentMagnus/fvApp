function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function errorHandler(err, req, res, _next) {
  // Malformed JSON body from express.json()
  if (err.type === 'entity.parse.failed') err.status = 400;

  // Database without tables (e.g. a new Turso database that hasn't been migrated yet).
  if (/no such table/i.test(err.message || '')) {
    console.error(`[ERROR] ${err.message}`);
    err.status = 503;
    err.message = 'Databasen saknar tabeller – den är inte uppsatt än. Kör "npm run migrate:turso" (eller kopiera in data med "npm run db:copy-to-turso -- --apply"). Se DEPLOY-VERCEL.md.';
  }

  const status = err.status || 500;
  if (status >= 500) console.error(`[ERROR] ${err.message}`, err.stack);

  // 503 messages are our own, safe explanations (e.g. database not set up); other 5xx stay generic.
  const message = status >= 500 && status !== 503 ? 'Internt serverfel' : err.message;

  if (req.xhr || req.originalUrl.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
    return res.status(status).json({ error: message });
  }

  res.status(status).send(`
    <!DOCTYPE html>
    <html><head><title>Fel ${status}</title></head>
    <body style="font-family:sans-serif;text-align:center;padding:4rem">
      <h1>${status}</h1><p>${escapeHtml(message)}</p>
      <a href="/">Tillbaka</a>
    </body></html>
  `);
}

module.exports = errorHandler;
