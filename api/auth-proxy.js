const ALLOWED_METHODS = new Set(['GET', 'POST']);

function upstreamUrl(req) {
  const baseUrl = String(process.env.TWM_BASE_URL || '').replace(/\/$/, '');
  if (!/^https:\/\/[^/]+\.onrender\.com$/.test(baseUrl)) {
    throw new Error('TWM_BASE_URL is not configured for the auth proxy.');
  }
  const pathValue = Array.isArray(req.query.path) ? req.query.path.join('/') : (req.query.path || '');
  const target = new URL(`${baseUrl}/auth${pathValue ? `/${pathValue}` : ''}`);
  Object.entries(req.query).forEach(([key, value]) => {
    if (key === 'path') return;
    (Array.isArray(value) ? value : [value]).forEach(item => target.searchParams.append(key, item));
  });
  return target;
}

module.exports = async function authProxy(req, res) {
  if (!ALLOWED_METHODS.has(req.method)) {
    res.setHeader('Allow', [...ALLOWED_METHODS].join(', '));
    return res.status(405).json({ detail: 'Method not allowed.' });
  }

  try {
    const headers = { Accept: 'application/json' };
    if (req.headers.cookie) headers.Cookie = req.headers.cookie;
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
    const upstream = await fetch(upstreamUrl(req), {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method)
        ? undefined
        : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})),
    });

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    const setCookies = typeof upstream.headers.getSetCookie === 'function'
      ? upstream.headers.getSetCookie()
      : [upstream.headers.get('set-cookie')].filter(Boolean);
    if (setCookies.length) res.setHeader('Set-Cookie', setCookies);
    return res.status(upstream.status).send(await upstream.text());
  } catch (error) {
    console.error('Auth proxy failed.', { error_type: error?.name || 'Error' });
    return res.status(502).json({ detail: 'Account authentication is temporarily unavailable.' });
  }
};
