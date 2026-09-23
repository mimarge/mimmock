#!/usr/bin/env bash
# MimMock TEST imza sertifikası — plan §1 / K9.
#
# 🔴 Bu GERÇEK bir mali mühür DEĞİLDİR ve olamaz.
#    - kendinden imzalıdır: hiçbir zincire bağlanmaz
#    - CN'i ve O'su bunu büyük harfle söyler
#    - özel anahtarı depoda AÇIKTA durur (plan §2b: "amacına özel üretilmiş,
#      hiçbir zincire bağlanmayan atılabilir anahtar" — public'e gidebilir)
#
# Amaç: geliştiricinin ayrıştırıcısı çalışsın, imza YAPISI gerçek olsun,
# zincir doğrulaması KASTEN başarısız olsun.
set -euo pipefail
OUT="$(cd "$(dirname "$0")/.." && pwd)/server/src/signing/test-cert"
mkdir -p "$OUT"

SUBJECT="/C=TR/O=MIMMOCK TEST - NOT A REAL SEAL/OU=SANDBOX ONLY/CN=MIMMOCK TEST SERTIFIKASI - GERCEK DEGIL"

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$OUT/test-key.pem" \
  -out "$OUT/test-cert.pem" \
  -days 7300 \
  -subj "$SUBJECT" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature,nonRepudiation" \
  -addext "extendedKeyUsage=emailProtection" \
  2>/dev/null

echo "üretildi: $OUT"
openssl x509 -in "$OUT/test-cert.pem" -noout -subject -issuer -dates
