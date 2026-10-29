/**
 * رموز موقّعة: base64url(payload).base64url(HMAC-SHA256) بمفتاح AUTH_SECRET.
 * لكل رمز نوع (typ) فلا يصلح رمز ملف كجلسة ولا العكس.
 *   - الجلسة: كوكي httpOnly يثبت الهوية فقط؛ الدور والإيقاف يُقرآن من قاعدة البيانات في كل طلب.
 *   - الملف: رابط تنزيل مؤقت لمستند خاص بعد التحقق من صلاحية الوصول.
 */
export const SESSION_COOKIE = "mueqeb_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const encoder = new TextEncoder();

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET مطلوب (32 حرفاً على الأقل). انظر .env.local.example");
  }
  return secret;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string) {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmacKey() {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

type Signed = { typ: string; exp: number };

async function sign<T extends Signed>(payload: T) {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

async function verify<T extends Signed>(token: string | undefined, typ: string, now: number) {
  if (!token) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      fromBase64Url(signature),
      encoder.encode(body),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as T;
    if (payload.typ !== typ || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

const seconds = (ms: number) => Math.floor(ms / 1000);

type SessionPayload = Signed & { sub: string };

export function signSession(userId: string, now = Date.now()) {
  return sign<SessionPayload>({
    typ: "session",
    sub: userId,
    exp: seconds(now) + SESSION_MAX_AGE_SECONDS,
  });
}

/** معرّف المستخدم إن كان الرمز صحيح التوقيع وغير منتهٍ، وإلا null */
export async function verifySession(token: string | undefined, now = Date.now()) {
  const payload = await verify<SessionPayload>(token, "session", now);
  return typeof payload?.sub === "string" ? payload.sub : null;
}

type FilePayload = Signed & { bucket: string; path: string };

export function signFileToken(bucket: string, path: string, ttlSeconds: number, now = Date.now()) {
  return sign<FilePayload>({ typ: "file", bucket, path, exp: seconds(now) + ttlSeconds });
}

export async function verifyFileToken(token: string | undefined, now = Date.now()) {
  const payload = await verify<FilePayload>(token, "file", now);
  if (typeof payload?.bucket !== "string" || typeof payload.path !== "string") return null;
  return { bucket: payload.bucket, path: payload.path };
}
