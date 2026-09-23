const REALM = 'car-game';

function timingSafeEqual(candidate, expected) {
  let diff = candidate.length === expected.length ? 0 : 1;
  const max = Math.max(candidate.length, expected.length);
  for (let i = 0; i < max; i += 1) {
    const a = i < candidate.length ? candidate.charCodeAt(i) : 0;
    const b = i < expected.length ? expected.charCodeAt(i) : 0;
    if (a !== b) diff += 1;
  }
  return diff === 0;
}

function unauthorized() {
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${REALM}"` },
  });
}

export async function onRequest(context) {
  const { env, request } = context;
  const expectedUser = env.SITE_USER;
  const expectedPass = env.SITE_PASSWORD;
  if (
    expectedUser === undefined ||
    expectedUser === '' ||
    expectedPass === undefined ||
    expectedPass === ''
  ) {
    return unauthorized();
  }

  const header = request.headers.get('Authorization');
  if (!header) return unauthorized();
  const match = /^Basic\s+(.+)$/i.exec(header);
  if (!match) return unauthorized();

  let decoded;
  try {
    const bytes = Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0));
    decoded = new TextDecoder().decode(bytes);
  } catch {
    return unauthorized();
  }

  if (!timingSafeEqual(decoded, `${expectedUser}:${expectedPass}`)) {
    return unauthorized();
  }
  return context.next();
}