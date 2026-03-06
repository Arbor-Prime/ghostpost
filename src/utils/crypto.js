const crypto = require('crypto');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getKey() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key || key.length < 64) throw new Error('ENCRYPTION_KEY must be 64+ hex chars');
    return Buffer.from(key.slice(0, 64), 'hex');
}

function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted format');
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(parts[2], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function encryptCookies(cookies) {
    return encrypt(JSON.stringify(cookies));
}

function decryptCookies(encryptedText) {
    return JSON.parse(decrypt(encryptedText));
}

module.exports = { encrypt, decrypt, encryptCookies, decryptCookies };
