import crypto from 'crypto';

export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return timingSafeEqualString(signature, expected);
}

export function generateIdempotencyKey(
  taskId: string,
  workerId: string,
  retryCounter: number,
): string {
  const microTimestamp = Date.now();
  const raw = `${taskId}:${workerId}:${microTimestamp}:${retryCounter}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function isTimestampFresh(
  timestampHeader: string | null,
  maxAgeSeconds = 300,
): boolean {
  if (!timestampHeader) return false;
  const ts = Number(timestampHeader);
  if (Number.isNaN(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - ts) <= maxAgeSeconds;
}
