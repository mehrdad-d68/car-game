function notFound() {
  return new Response(JSON.stringify({ error: 'Not Found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function onRequestGet(context) {
  const asset = await context.env.ASSETS.fetch(context.request);
  if (asset.status === 404) {
    return notFound();
  }
  const contentType = asset.headers.get('content-type') ?? '';
  if (asset.status === 200 && contentType.toLowerCase().includes('text/html')) {
    return notFound();
  }
  return asset;
}