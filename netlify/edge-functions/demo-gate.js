// Password gate for the demo site only (Netlify). Production on GitHub Pages never runs this.
// The password lives in the Netlify project's DEMO_PASSWORD variable, not in this repo.
// Any username works; with no password set, the demo stays closed.
export default async (request, context) => {
  const expected = Netlify.env.get('DEMO_PASSWORD');
  const header = request.headers.get('authorization') || '';
  if (expected && header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      if (decoded.slice(decoded.indexOf(':') + 1) === expected) return context.next();
    } catch { /* malformed header: fall through to the prompt */ }
  }
  return new Response('Password required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Hololand demo", charset="UTF-8"', 'Cache-Control': 'no-store' },
  });
};
