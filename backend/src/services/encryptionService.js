const crypto = require('crypto');

const ALGORITHM  = 'aes-256-gcm';
const IV_LENGTH  = 16;
const TAG_LENGTH = 16;

const getKey = () => {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
};

const encrypt = (plaintext) => {
  if (!plaintext) return null;
  const key = getKey();
  const iv  = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

const decrypt = (encryptedData) => {
  if (!encryptedData) return null;
  const key = getKey();
  const [ivHex, tagHex, dataHex] = encryptedData.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Invalid encrypted data format');
  const iv        = Buffer.from(ivHex,  'hex');
  const tag       = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(dataHex,'hex');
  const decipher  = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
};

module.exports = { encrypt, decrypt };
