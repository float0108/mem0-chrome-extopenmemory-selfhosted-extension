/** Relay content-script requests through the extension origin, not the chat site. */
export async function memoryFetch(
  url: string,
  init: NonNullable<Parameters<typeof fetch>[1]> = {}
): Promise<Response> {
  init.signal?.throwIfAborted();
  const result = await chrome.runtime.sendMessage({
    action: 'LOCAL_MEMORY_FETCH',
    url,
    method: init.method || 'GET',
    body: init.body,
  });
  init.signal?.throwIfAborted();
  if (!result || result.error) {
    throw new Error(result?.error || 'Memory server unavailable');
  }
  return new Response(result.body, { status: result.status, headers: result.headers });
}
