/** Server-side defense in depth for logs, provider responses and health errors. */
export function redactText(value: string): string {
  let safe = value;
  for (const [name, secret] of Object.entries(process.env)) {
    if (!/(KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL)$/i.test(name) || !secret || secret.length < 8) continue;
    for (const encoded of new Set([secret, encodeURIComponent(secret)])) safe = safe.split(encoded).join('[REDACTED]');
  }
  return safe.replace(/([?&](?:api[_-]?key|access_token|token|secret|password)=)[^&\s"']+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]')
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, '$1[REDACTED]@');
}
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 15) return '[depth limit]';
  if (typeof value === 'string') return redactText(value);
  if (value instanceof Date) return value;
  if (value instanceof Error) return { name: value.name, message: redactText(value.message), stack: value.stack ? redactText(value.stack) : undefined };
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k,
    /^(authorization|api[_-]?key|.*secret|password|access[_-]?token|refresh[_-]?token|credentials?)$/i.test(k) ? '[REDACTED]' : redactValue(v, depth + 1)]));
  return value;
}
