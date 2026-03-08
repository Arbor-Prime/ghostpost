#!/usr/bin/env python3
"""Fix: ensure user-auth routes are registered in server.js"""
with open('/opt/ghostpost/src/server.js', 'r') as f:
    code = f.read()

# Check if user-auth is already imported
if 'user-auth' in code:
    print("user-auth: ALREADY IMPORTED")
else:
    # Add import after the auth import
    code = code.replace(
        "const { registerAuthRoutes } = require('./routes/auth');",
        "const { registerAuthRoutes } = require('./routes/auth');\nconst { registerUserAuthRoutes } = require('./routes/user-auth');"
    )
    print("user-auth: IMPORT ADDED")

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
    elif 'registerAuthRoutes(app, db)' in code:
        code = code.replace(
            'registerAuthRoutes(app, db)',
            'registerAuthRoutes(app, db);\nregisterUserAuthRoutes(app);'
        )
        print("registerUserAuthRoutes: CALL ADDED (with db)")
    else:
        # Just append before the health route
        code = code.replace(
            "app.use('/api', healthRouter)",
            "registerUserAuthRoutes(app);\napp.use('/api', healthRouter)"
        )
        print("registerUserAuthRoutes: ADDED BEFORE HEALTH")

with open('/opt/ghostpost/src/server.js', 'w') as f:
    f.write(code)

print("WRITTEN")

# Verify
with open('/opt/ghostpost/src/server.js', 'r') as f:
    final = f.read()
assert 'user-auth' in final, "FAILED: user-auth not in file"
assert 'registerUserAuthRoutes' in final, "FAILED: registerUserAuthRoutes not in file"
print("VERIFIED")

# Restart
import os
os.system("cd /opt/ghostpost && npx pm2 restart ghostpost")
import time; time.sleep(3)

# Test
import subprocess
result = subprocess.run(['curl', '-s', 'http://localhost:3000/api/auth/me'], capture_output=True, text=True)
print(f"Auth test: {result.stdout[:100]}")
print("DONE")
