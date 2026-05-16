#!/usr/bin/env python3
"""
Extract cookies from Safari for all MrSabPata platforms.
Run once (or whenever sessions expire): python3 scripts/extract-cookies.py
"""
import json, sys, os
try:
    import browser_cookie3
except ImportError:
    print("Run: pip3 install browser-cookie3 --break-system-packages")
    sys.exit(1)

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "company")
os.makedirs(OUT_DIR, exist_ok=True)

PLATFORMS = {
    "x":         [".x.com", ".twitter.com"],
    "tiktok":    [".tiktok.com"],
    "youtube":   [".youtube.com", "studio.youtube.com", ".google.com", ".googleapis.com"],
    "instagram": [".instagram.com"],
}

SESSION_COOKIE_NAMES = {
    "sessionid", "sessionid_ss", "auth_token", "ct0",
    "SID", "SSID", "HSID", "sid_guard", "uid_tt_ss",
}

print("Reading Safari cookies...")
try:
    all_cookies = list(browser_cookie3.safari())
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)

for platform, domains in PLATFORMS.items():
    cookies = []
    for c in all_cookies:
        if any(d in c.domain for d in domains):
            # Use SameSite=None for secure cookies (allows cross-origin use by Playwright)
            same_site = "None" if bool(c.secure) else "Lax"
            cookies.append({
                "name":     c.name,
                "value":    c.value,
                "domain":   c.domain,
                "path":     c.path or "/",
                "expires":  int(c.expires) if c.expires else -1,
                "httpOnly": False,
                "secure":   bool(c.secure),
                "sameSite": same_site,
            })

    if cookies:
        state = {"cookies": cookies, "origins": []}
        out = os.path.join(OUT_DIR, f"{platform}-cookies.json")
        with open(out, "w") as f:
            json.dump(state, f, indent=2)
        has_session = any(c["name"] in SESSION_COOKIE_NAMES for c in cookies)
        status = "✅ logged in" if has_session else "⚠️  NO session cookie — may not be logged in"
        print(f"  {platform}: {len(cookies)} cookies ({status})")
    else:
        print(f"  {platform}: ❌ NOT logged in — open Safari, log into {domains[0].lstrip('.')}, re-run this script")

print("\nDone. Re-run if any platform session expires.")
