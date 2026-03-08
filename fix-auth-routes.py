#!/usr/bin/env python3
"""Fix: ensure user-auth routes are registered in server.js"""

with open('/opt/ghostpost/src/server.js', 'r') as f:
    code = f.read()

# Check if user-auth is already imported
if 'user-auth' in code:
    print("user-auth: ALREADY IMPORTED")
else:
    # Add import after the auth import
    if "require('./routes/auth')" in code:
        code = code.replace(
            "require('./routes/auth')",
            "require('./routes/auth');\nconst { registerUserAuthRoutes } = require('./routes/user-auth')"
        )
        print("user-auth: IMPORT ADDED")
    else:
        print("ERROR: Can't find auth import")

# Check if registerUserAuthRoutes is called
if 'registerUserAuthRoutes(app)' in code:
    print("registerUserAuthRoutes: ALREADY CALLED")
else:
    # Add call after registerAuthRoutes
    if 'registerAuthRoutes(app)' in code:
        code = code.replace(
            'registerAuthRoutes(app)',
            'registerAuthRoutes(app);\nregisterUserAuthRoutes(app);'
        )
        print("registerUserAuthRoutes: CALL ADDED")
    elif 'registerAuthRoutes(app,' in code:
        # Might have extra params
        lines = code.split('\n')
        for i, line in enumerate(lines):
            if 'registerAuthRoutes(app' in line:
                lines.insert(i+1, 'registerUserAuthRoutes(app);')
                code = '\n'.join(lines)
                print("registerUserAuthRoutes: CALL ADDED (after line " + str(i) + ")")
                break
    else:
        print("ERROR: Can't find registerAuthRoutes call")

with open('/opt/ghostpost/src/server.js', 'w') as f:
    f.write(code)

# Verify
with open('/opt/ghostpost/src/server.js', 'r') as f:
    final = f.read()

if 'user-auth' in final and 'registerUserAuthRoutes' in final:
    print("VERIFIED: user-auth routes configured")
else:
    print("FAILED: check server.js manually")

# Also check the file exists
import os
if os.path.exists('/opt/ghostpost/src/routes/user-auth.js'):
    print("user-auth.js: EXISTS")
else:
    print("user-auth.js: MISSING - this is the problem")

# Restart PM2
os.system("cd /opt/ghostpost && npx pm2 restart ghostpost")
import time; time.sleep(3)

# Test signup
import subprocess
result = subprocess.run(['curl', '-s', '-X', 'POST', 'http://localhost:3000/api/auth/signup',
    '-H', 'Content-Type: application/json',
    '-d', '{"name":"FixTest","email":"fixtest99@test.com","password":"test123"}'],
    capture_output=True, text=True)
print("Signup test:", result.stdout[:200])
