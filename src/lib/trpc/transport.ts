/** Never parse an authentication page or hosting error as application JSON.
 * No response body is echoed: it may contain private data or credentials.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  const type = response.headers.get('content-type') ?? '';
  if (/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(type)) return response;
  if (response.redirected || response.status === 401) {
    throw new Error('Your session needs attention. Sign in again, then select your workspace.');
  }
  if (response.status === 403) {
    throw new Error('Access was denied. Check your workspace access or ask an administrator.');
  }
  throw new Error(`Relay could not load this request (HTTP ${response.status}). Retry shortly; if it continues, check System and the web deployment logs.`);
}
