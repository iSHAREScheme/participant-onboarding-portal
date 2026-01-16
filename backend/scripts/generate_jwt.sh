#!/usr/bin/env bash
set -euo pipefail

OUT_DIR=${1:-keys}
ISS=${ISS:-"https://staging.obp.ishare.eu"}
AUD=${AUD:-"api.obp.ishare.eu"}
SUB=${SUB:-"local-dev"}
TTL=${TTL:-3600} # seconds

mkdir -p "$OUT_DIR"

# 1) Generate RSA private key (PKCS#1) and extract public key (PKCS#8)
openssl genrsa -out "$OUT_DIR/private_pkcs1.pem" 2048
# Public key in PKCS#8 (BEGIN PUBLIC KEY) – this is what your Go middleware expects
openssl rsa -in "$OUT_DIR/private_pkcs1.pem" -pubout -out "$OUT_DIR/public.pem"
# Optional: unencrypted PKCS#8 private key variant
openssl pkcs8 -topk8 -inform PEM -in "$OUT_DIR/private_pkcs1.pem" -out "$OUT_DIR/private_pkcs8.pem" -nocrypt

# 2) Mint a JWT with RS256 (no external NPM deps)
cat > "$OUT_DIR/mint.js" <<'JS'
const fs = require('fs')
const crypto = require('crypto')

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
const [,, keyPath, iss, aud, sub, ttlSec] = process.argv
const now = Math.floor(Date.now()/1000)
const payload = { iss, aud, sub, iat: now, exp: now + Number(ttlSec || 3600) }
const header = { alg: 'RS256', typ: 'JWT' }

const signingInput = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload))
const key = fs.readFileSync(keyPath, 'utf8')
const signer = crypto.createSign('RSA-SHA256')
signer.update(signingInput)
const signature = signer.sign(key)
console.log(signingInput + '.' + b64url(signature))
JS

JWT=$(node "$OUT_DIR/mint.js" "$OUT_DIR/private_pkcs1.pem" "$ISS" "$AUD" "$SUB" "$TTL")
printf '%s\n' "$JWT" > "$OUT_DIR/token.txt"

echo "Generated:"
echo "  Public key:   $OUT_DIR/public.pem"
echo "  Private key:  $OUT_DIR/private_pkcs1.pem (and private_pkcs8.pem)"
echo "  JWT:          $OUT_DIR/token.txt"
echo
echo "→ Use public.pem contents for AUTH_PUBLIC_KEY in your backend."
echo "→ Send the JWT as: Authorization: Bearer $(head -c 16 $OUT_DIR/token.txt; echo '...')"