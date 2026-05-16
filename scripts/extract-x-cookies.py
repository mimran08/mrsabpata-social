#!/usr/bin/env python3
"""
Extract X.com cookies from the logged-in Chrome browser.
Run this once to save your session. Playwright will use it for headless posting.

Usage: python3 scripts/extract-x-cookies.py
"""
import json, sys, os

try:
    import browser_cookie3
except ImportError:
    print("Run: pip3 install browser-cookie3 --break-system-packages")
    sys.exit(1)

OUT = os.path.join(os.path.dirname(__file__), "..", "company", "x-cookies.json")

print("Reading X.com cookies from Safari...")
try:
    jar = browser_cookie3.safari(domain_name=".x.com")
    cookies = []
    for c in jar:
        if "x.com" in c.domain or "twitter.com" in c.domain:
            cookies.append({
                "name":     c.name,
                "value":    c.value,
                "domain":   c.domain,
                "path":     c.path or "/",
                "expires":  int(c.expires) if c.expires else -1,
                "httpOnly": False,
                "secure":   bool(c.secure),
                "sameSite": "Lax",
            })

    if not cookies:
        print("No X cookies found — make sure you're logged into x.com in Safari.")
        sys.exit(1)

    # Playwright storageState format
    state = { "cookies": cookies, "origins": [] }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(state, f, indent=2)

    print(f"Saved {len(cookies)} cookies → {OUT}")
    print("X posting via browser is now ready.")

except Exception as e:
    print(f"Error: {e}")
    print("Make sure Chrome is running and you are logged into x.com")
    sys.exit(1)
