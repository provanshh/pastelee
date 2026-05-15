const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const toIco = require('to-ico');

const outDir = path.join(__dirname, '..', 'build');
const pngPath = path.join(outDir, 'icon.png');
const icoPath = path.join(outDir, 'icon.ico');

const size = 256;
const png = new PNG({ width: size, height: size });

function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const idx = (size * y + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

function fillRect(x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      setPixel(x, y, color[0], color[1], color[2], color[3] ?? 255);
    }
  }
}

function fillRoundedRect(x0, y0, w, h, r, color) {
  const x1 = x0 + w - 1;
  const y1 = y0 + h - 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = Math.min(x - x0, x1 - x);
      const dy = Math.min(y - y0, y1 - y);
      if (dx >= r || dy >= r || dx * dx + dy * dy <= r * r) {
        setPixel(x, y, color[0], color[1], color[2], color[3] ?? 255);
      }
    }
  }
}

function drawBackground() {
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const glow = Math.max(0, 1 - dist);
      const r = Math.round(8 + glow * 28);
      const g = Math.round(18 + glow * 114);
      const b = Math.round(37 + glow * 130);
      setPixel(x, y, r, g, b, 255);
    }
  }
}

function drawPrismMark() {
  // Outer card
  fillRoundedRect(58, 48, 140, 160, 28, [255, 255, 255, 26]);
  fillRoundedRect(66, 56, 124, 144, 24, [255, 255, 255, 18]);

  // Prism triangle outline
  const topX = 128;
  const topY = 66;
  const leftX = 84;
  const leftY = 162;
  const rightX = 172;
  const rightY = 162;
  const midY = 128;

  const line = (x0, y0, x1, y1, color, thickness = 3) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      fillRoundedRect(x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, 2, color);
    }
  };

  line(leftX, leftY, topX, topY, [68, 229, 196, 255], 4);
  line(topX, topY, rightX, rightY, [56, 189, 248, 255], 4);
  line(leftX, leftY, rightX, rightY, [232, 238, 252, 255], 4);

  // Inner prism glow
  fillRoundedRect(108, 98, 40, 56, 18, [255, 255, 255, 25]);
  fillRoundedRect(118, 104, 20, 44, 9, [56, 189, 248, 180]);

  // Small clipboard base
  fillRoundedRect(92, 170, 72, 14, 7, [232, 238, 252, 200]);

  // Accent dots
  fillRoundedRect(98, 78, 10, 10, 5, [68, 229, 196, 255]);
  fillRoundedRect(148, 78, 10, 10, 5, [56, 189, 248, 255]);
}

drawBackground();
drawPrismMark();

fs.writeFileSync(pngPath, PNG.sync.write(png));
const pngBuffer = fs.readFileSync(pngPath);
toIco([pngBuffer]).then((icoBuffer) => {
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`Wrote ${pngPath}`);
  console.log(`Wrote ${icoPath}`);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
