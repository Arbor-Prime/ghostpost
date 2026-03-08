import os, time, subprocess

path = '/opt/ghostpost/src/server.js'
with open(path, 'r') as f:
    code = f.read()

if 'cookie-parser' not in code:
    code = code.replace("const express = require('express');", "const express = require('express');\nconst cookieParser = require('cookie-parser');")
    print("ADDED: cookie-parser require")

if 'cookieParser()' not in code:
    if 'app.use(express.json' in code:
        code = code.replace('app.use(express.json', 'app.use(cookieParser());\napp.use(express.json')
        print("ADDED: app.use(cookieParser())")

with open(path, 'w') as f:
    f.write(code)

print("VERIFIED" if 'cookieParser()' in open(path).read() else "FAILED")

os.system("cd /opt/ghostpost && npx pm2 restart ghostpost")
time.sleep(3)

r = subprocess.run(['curl','-s','-X','POST','http://localhost:3000/api/auth/signup','-H','Content-Type: application/json','-d','{"name":"CP","email":"cp99@test.com","password":"testpass123"}','-c','/tmp/cp.txt'], capture_output=True, text=True)
print("Signup:", r.stdout[:80])

r2 = subprocess.run(['curl','-s','http://localhost:3000/api/auth/me','-b','/tmp/cp.txt'], capture_output=True, text=True)
print("Auth:", r2.stdout[:80])
print("=== WORKING ===" if '"user"' in r2.stdout else "=== BROKEN ===")
