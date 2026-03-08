#!/bin/bash
set -e

# Fix 1: Make voice upload async
cd /opt/ghostpost
python3 << 'PYFIX'
with open('src/routes/voice.js', 'r') as f:
    code = f.read()

old = """const voiceProfile = await buildVoiceProfile(userId, req.file.buffer);
      res.json({ ok: true, voiceProfile });"""

new = """// Return immediately — process in background
      res.status(202).json({ ok: true, status: 'processing' });
      buildVoiceProfile(userId, req.file.buffer).catch(err => {
        console.error('[Voice] Background processing failed:', err.message);
        db.query("UPDATE users SET voice_onboarding_status = 'failed' WHERE id = $1", [userId]);
      });"""

if old in code:
    code = code.replace(old, new)
    with open('src/routes/voice.js', 'w') as f:
        f.write(code)
    print("VOICE: FIXED")
else:
    # Try without extra spaces
    if 'await buildVoiceProfile' in code:
        print("VOICE: Pattern differs — showing context:")
        for i, line in enumerate(code.split('\n')):
            if 'buildVoiceProfile' in line or 'voiceProfile' in line.lower():
                print(f"  Line {i}: {line.strip()}")
    else:
        print("VOICE: Already fixed or file different")
PYFIX

# Fix 2: Nginx timeout
if ! grep -q 'proxy_read_timeout' /etc/nginx/sites-enabled/ghostpost* 2>/dev/null; then
    sed -i '/proxy_pass.*3000/a\        proxy_read_timeout 300s;' /etc/nginx/sites-enabled/ghostpost* 2>/dev/null
    nginx -t && systemctl reload nginx
    echo "NGINX: FIXED"
else
    echo "NGINX: Already has timeout"
fi

# Fix 3: Reset stuck users
psql -U ghostpost -d ghostpost -c "UPDATE users SET voice_onboarding_status = 'pending', voice_profile = NULL WHERE voice_onboarding_status = 'processing';" 2>/dev/null
echo "STUCK USERS: RESET"

# Restart
npx pm2 restart ghostpost
sleep 2
echo "PM2: RESTARTED"
echo "=== ALL DONE ==="
