import sharp from "sharp";
async function main() {
  const W = 1024, H = 1024;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#1B3550"/>
      <stop offset="100%" stop-color="#0D1B2A"/>
    </radialGradient>
  </defs>
  <circle cx="${W/2}" cy="${H/2}" r="${W/2 - 20}" fill="url(#bg)" stroke="#FFB000" stroke-width="10"/>
  <circle cx="${W/2}" cy="${H/2 + 240}" r="10" fill="#FFB000"/>
  <text x="${W/2}" y="${H/2 + 100}" font-family="Helvetica, Arial, sans-serif" font-size="470" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="-14">SP</text>
</svg>`;
  await sharp(Buffer.from(svg)).png({ quality: 100 }).toFile("company/tiktok-app-icon.png");
  console.log("Generated 1024x1024 icon.");
}
main();
