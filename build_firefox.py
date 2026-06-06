import zipfile
import os
import re

# Read global_ui.js
with open('global_ui.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Strip PiP CSS
js = re.sub(r'#pip-btn\s*\{.*?\n    \}\n', '', js, flags=re.DOTALL)
js = re.sub(r'#pip-btn:hover\s*\{.*?\n    \}\n', '', js, flags=re.DOTALL)
js = re.sub(r'#pip-btn svg\s*\{.*?\n    \}\n', '', js, flags=re.DOTALL)

# Strip PiP HTML
js = re.sub(r'<button id="pip-btn".*?</button>', '', js, flags=re.DOTALL)

# Strip PiP JS logic
js = re.sub(r'const pipBtn = shadow\.getElementById\(\'pip-btn\'\);.*?// Dragging state', '// Dragging state', js, flags=re.DOTALL)
js = re.sub(r'let isPipActive = false;\s*let pipWindowObj = null;\s*pipBtn\.addEventListener.*?pill\.addEventListener', 'pill.addEventListener', js, flags=re.DOTALL)

# Remove isPipActive checks
js = re.sub(r'if \(isPipActive\) return; // Don\'t allow dragging inside PiP\s*', '', js)
js = re.sub(r'if \(!isDragging \|\| isPipActive\) return;', 'if (!isDragging) return;', js)

# Also fix manifest.json for Firefox
with open('manifest.json', 'r', encoding='utf-8') as f:
    manifest = f.read()

manifest_firefox = manifest.replace(
    '"service_worker": "background.js"',
    '"service_worker": "background.js",\n    "scripts": ["background.js"]'
)

# Remove old zip if it exists
if os.path.exists('symbiote-extension-firefox.zip'):
    os.remove('symbiote-extension-firefox.zip')

# Zip Firefox
with zipfile.ZipFile('symbiote-extension-firefox.zip', 'w') as z:
    z.writestr('global_ui.js', js)
    z.writestr('manifest.json', manifest_firefox)
    for file in ['background.js', 'content.js', 'intercept.js', 'README.md']:
        z.write(file, arcname=file)
    for root, _, files in os.walk('icons'):
        for file in files:
            z.write(os.path.join(root, file), arcname=f"icons/{file}")

print("Firefox bundle created without PiP.")
