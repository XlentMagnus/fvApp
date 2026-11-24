function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function errorHandler(err, req, res, _next) {
  // Malformed JSON body from express.json()
  if (err.type === 'entity.parse.failed') err.status = 400;

  const status = err.status || 500;
  if (status >= 500) console.error(`[ERROR] ${err.message}`, err.stack);

  const message = status >= 500 ? 'Internt serverfel' : err.message;

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
