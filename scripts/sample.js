const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { distDirectory } = require('./build');

const width = 1200;
const margin = 52;
const samplesDirectory = path.resolve(__dirname, '..', 'data', 'samples');
const samples = [
  { file: 'title.txt', size: 48, lineHeight: 64 },
  { file: 'characters.txt', size: 72, lineHeight: 96 },
  { file: '28.txt', size: 28, lineHeight: 24 },
  { file: '22.txt', size: 22, lineHeight: 24 },
  { file: '18.txt', size: 18, lineHeight: 24 },
];

function drawSector(x, y, radius, start, end, { red, green, blue, alpha }) {
  const point = (angle) => `${x + radius * Math.cos(angle)} ${y + radius * Math.sin(angle)}`;
  const largeArc = Number(end - start > Math.PI);
  const sector = `M ${x} ${y} L ${point(start)} A ${radius} ${radius} 0 ${largeArc} 1 ${point(end)} Z`;
  return `<path d="${sector}" fill="rgb(${red},${green},${blue})" fill-opacity="${alpha / 255}" shape-rendering="crispEdges"/>`;
}

function shapeText(hb, font, text) {
  const run = new hb.Buffer();
  run.addText(text);
  run.guessSegmentProperties();
  run.setLanguage('ja');
  hb.shape(font, run);
  const positions = run.getGlyphPositions();
  const advance = positions.reduce((total, { xAdvance }) => total + xAdvance, 0);
  return { glyphs: run.getGlyphInfos(), positions, advance };
}

function wrapParagraph(hb, font, paragraph, scale) {
  const lines = [];
  let text = '';
  let shaped;
  // Keep Japanese commas and periods attached to the preceding character.
  for (const unit of paragraph.match(/.[、。]*/gu) ?? []) {
    const candidate = shapeText(hb, font, text + unit);
    if (text && candidate.advance * scale > width - 2 * margin) {
      lines.push(shaped);
      text = unit;
      shaped = shapeText(hb, font, unit);
    } else {
      text += unit;
      shaped = candidate;
    }
  }
  if (shaped) lines.push(shaped);
  return lines;
}

function makeLineRenderer(hb, font, unitsPerEm) {
  const paint = new hb.PaintFuncs();
  let sectors;
  let lineIndex = 0;
  paint.setSweepGradientFunc(({ colorStops }, cx, cy, start, end) => {
    const angleAt = (offset) => start + offset * (end - start);
    // Adjacent equal offsets mark hard color changes in the font's sweep.
    sectors = colorStops.slice(0, -1).flatMap(({ offset, color }, index) => {
      const next = colorStops[index + 1].offset;
      return offset < next ? [drawSector(cx, cy, 4 * unitsPerEm, angleAt(offset), angleAt(next), color)] : [];
    });
  });

  return ({ glyphs, positions }, scale, baseline) => {
    let x = margin;
    const row = lineIndex++;
    return glyphs.map(({ codepoint }, index) => {
      const { xOffset, yOffset, xAdvance } = positions[index];
      const origin = [x + xOffset * scale, baseline - yOffset * scale];
      x += xAdvance * scale;
      if (codepoint === 0) throw new Error('The Regular font is missing a sample character.');
      const outline = font.glyphToPath(codepoint);
      if (!outline) return '';

      sectors = undefined;
      if (!font.paintGlyphOrFail(codepoint, paint) || !sectors?.length) {
        throw new Error(`The Regular font is missing the color sweep for glyph ${codepoint}.`);
      }
      const clip = `glyph-${row}-${index}`;
      // HarfBuzz outlines use y-up coordinates, while SVG positions use y-down.
      return `<g transform="translate(${origin.join(' ')}) scale(${scale} ${-scale})"><clipPath id="${clip}"><path d="${outline}"/></clipPath><g clip-path="url(#${clip})">${sectors.join('')}</g></g>`;
    }).join('');
  };
}

async function main() {
  const [hb, bytes] = await Promise.all([
    import('harfbuzzjs'),
    fs.readFile(path.join(distDirectory, 'static', 'NottsuSansJP-Regular.ttf')),
  ]);
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const face = new hb.Face(new hb.Blob(data));
  const font = new hb.Font(face);
  const drawLine = makeLineRenderer(hb, font, face.upem);
  for (const { file, size, lineHeight } of samples) {
    const text = (await fs.readFile(path.join(samplesDirectory, file), 'utf8')).trimEnd();
    if (!text) throw new Error(`Empty sample: ${file}`);
    const artwork = [];
    let top = 28;
    const scale = size / face.upem;
    const baselineOffset = (lineHeight - size) / 2 + size * 0.85;
    for (const paragraph of text.split(/\r?\n/)) {
      for (const line of wrapParagraph(hb, font, paragraph, scale)) {
        artwork.push(drawLine(line, scale, top + baselineOffset));
        top += lineHeight;
      }
    }
    const height = top + 28;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${2 * width}" height="${2 * height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/>${artwork.join('')}</svg>`;
    const output = `0-color-${path.basename(file, '.txt')}.png`;
    await sharp(Buffer.from(svg)).png().toFile(path.resolve(__dirname, '..', output));
    console.log(`Wrote ${output}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
