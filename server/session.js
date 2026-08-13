const crypto = require('crypto');

const COOKIE_NAME = 'session';
const MAX_AGE_SEC = 30 * 24 * 60 * 60;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is required');
  }
  return secret;
}

function sign(value) {
  const signature = crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');
  return `${value}.${signature}`;
}

function unsign(signedValue) {
  const separatorIndex = signedValue.lastIndexOf('.');
  if (separatorIndex === -1) {
    return null;
  }

  const value = signedValue.slice(0, separatorIndex);
  const signature = signedValue.slice(separatorIndex + 1);
  const expected = crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');

  if (signature.length !== expected.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  return value;
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header.split(';').map((part) => {
      const trimmed = part.trim();
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        return [trimmed, ''];
      }
      const key = trimmed.slice(0, eqIndex);
      const value = trimmed.slice(eqIndex + 1);
      return [key, decodeURIComponent(value)];
    })
  );
}

function setSessionCookie(res, userId) {
  const signed = sign(userId);
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(signed)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SEC}`
  );
}

function getUserIdFromRequest(req) {
  const cookies = parseCookies(req);
  const raw = cookies[COOKIE_NAME];
  if (!raw) {
    return null;
  }
  return unsign(raw);
}

module.exports = {
  getUserIdFromRequest,
  setSessionCookie,
};
