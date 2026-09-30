const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_HASH = 'SHA-256';
const PBKDF2_KEY_LEN = 32;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function createSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bytesToHex(salt);
}

export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const salt = hexToBytes(saltHex);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: PBKDF2_HASH,
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    PBKDF2_KEY_LEN * 8
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function verifyPassword(password: string, saltHex: string, expectedHashHex: string): Promise<boolean> {
  const actual = await hashPassword(password, saltHex);
  if (actual.length !== expectedHashHex.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) {
    diff |= actual.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
  }

  return diff === 0;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export function createSessionToken(): string {
  const token = crypto.getRandomValues(new Uint8Array(32));
  return bytesToHex(token);
}
