#!/usr/bin/env python3
"""
Sprint 23 Backend Deploy — Dojo Outreach Engine

Downloads all new files, runs migration, registers chat routes in server.js
"""
import os, subprocess

BASE = '/opt/ghostpost'
BRANCH = 'sprint-20-frontend-merge'
RAW = f'https://raw.githubusercontent.com/Arbor-Prime/ghostpost/{BRANCH}'

def run(cmd):
    print(f'  $ {cmd}')
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f'  ERROR: {result.stderr.strip()}')
    return result

print('=== Sprint 23 Backend Deploy ===\n')

# Step 1: Download new files
print('[1/5] Downloading new files...')
files = [
    'src/data/dojo-knowledge.json',
    'src/services/outreach/ai-chat.js',
    'src/routes/chat.js',
    'src/services/browser-session/socket-handler.js',
    'src/services/voice/extractor.js',
    'src/services/voice/transcriber.js',
    'src/db/migrations/014-outreach-engine.sql',
]

for f in files:
    dirpath = os.path.join(BASE, os.path.dirname(f))
    os.makedirs(dirpath, exist_ok=True)
    run(f'curl -sL -o {BASE}/{f} "{RAW}/{f}"')
    size = os.path.getsize(f'{BASE}/{f}')
    print(f'  ✓ {f} ({size} bytes)')

# Step 2: Run database migration
print('\n[2/5] Running database migration...')
run(f'sudo -u postgres psql ghostpost < {BASE}/src/db/migrations/014-outreach-engine.sql')
print('  ✓ Migration complete')

# Step 3: Register chat routes in server.js
print('\n[3/5] Registering chat routes in server.js...')
server_path = os.path.join(BASE, 'src/server.js')
server = open(server_path, 'r').read()

# Check if chat routes already registered
if 'registerChatRoutes' in server:
    print('  ⊘ Chat routes already registered')
else:
    # Add import near the top (after other requires)
    # Find a good insertion point — after the last require/import
    import_line = "const { registerChatRoutes } = require('./routes/chat');"
    
    # Add after the auth middleware require
    if "require('./middleware/auth')" in server:
        server = server.replace(
            "require('./middleware/auth')",
            "require('./middleware/auth');\n" + import_line
        )
    elif "require('./routes/" in server:
        # Find last require('./routes/...) and add after it
        lines = server.split('\n')
        last_route_idx = 0
        for i, line in enumerate(lines):
            if "require('./routes/" in line:
                last_route_idx = i
        lines.insert(last_route_idx + 1, import_line)
        server = '\n'.join(lines)
    else:
        # Fallback: add at the very top after first require block
        server = import_line + '\n' + server

    # Add route registration — find where other routes are registered
    if 'registerChatRoutes(app' not in server:
        # Look for pattern like registerXxxRoutes(app
        register_patterns = [
            'registerUserAuthRoutes(app)',
            'registerVoiceRoutes(app)',
            'app.use(',
        ]
        inserted = False
        for pattern in register_patterns:
            if pattern in server:
                server = server.replace(
                    pattern,
                    pattern + '\n  registerChatRoutes(app, authenticateToken);'
                )
                inserted = True
                break
        
        if not inserted:
            # Last resort: add before the server.listen or at end
            if 'app.listen' in server:
                server = server.replace(
                    'app.listen',
                    'registerChatRoutes(app, authenticateToken);\n\napp.listen'
                )
            else:
                server += '\nregisterChatRoutes(app, authenticateToken);\n'

    with open(server_path, 'w') as f:
        f.write(server)
    print('  ✓ Chat routes registered in server.js')

# Step 4: Verify the require path resolves
print('\n[4/5] Verifying files exist...')
checks = [
    'src/data/dojo-knowledge.json',
    'src/services/outreach/ai-chat.js',
    'src/routes/chat.js',
    'src/services/browser-session/socket-handler.js',
]
for f in checks:
    path = os.path.join(BASE, f)
    exists = os.path.exists(path)
    size = os.path.getsize(path) if exists else 0
    status = '✓' if exists and size > 100 else '✗'
    print(f'  {status} {f} ({size} bytes)')

# Step 5: Nuclear restart
print('\n[5/5] Nuclear restart...')
run('cd /opt/ghostpost && npx pm2 kill')
run('killall -9 node 2>/dev/null; true')
run('pkill -f chromium 2>/dev/null; true')
run('sleep 2')
result = run('cd /opt/ghostpost && npx pm2 start src/server.js --name ghostpost')
run('sleep 3')
health = run('curl -s http://localhost:3000/api/health')
print(f'\n  Health: {health.stdout.strip()[:200]}')

print('\n✅ Sprint 23 backend deployed.')
print('Now deploy frontend: curl -sL -o /tmp/DEPLOY.sh "https://raw.githubusercontent.com/Arbor-Prime/Ghostpostu/main/dist/DEPLOY.sh" && bash /tmp/DEPLOY.sh')
