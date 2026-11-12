const path = require('node:path');
const sharp = require('sharp');

const rootDirectory = path.resolve(__dirname, '..');
const [input = path.join(rootDirectory, 'data', 'nottsu.png'), output = path.join(rootDirectory, '0-color.png')] = process.argv.slice(2);

// 2色の距離 (RGB ユークリッド)
function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

async function main() {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const cx = W / 2;
  const cy = H / 2;
  const half = Math.min(W, H) / 2;

  const pixel = (x, y) => {
    const i = (y * W + x) * C;
    return [data[i], data[i + 1], data[i + 2]];
  };

  // --- 1. リングを角度ごとにサンプリング ---
  // リングは外周近く (半径 0.90〜0.98 × half) にある想定で、帯の平均を取る
  const STEPS = 720; // 0.5度刻み
  const samples = [];
  for (let s = 0; s < STEPS; s++) {
    const rad = (s / STEPS) * Math.PI * 2;
    const acc = [0, 0, 0];
    let n = 0;
    for (let r = half * 0.9; r <= half * 0.98; r += 2) {
      const x = Math.round(cx + r * Math.cos(rad));
      const y = Math.round(cy + r * Math.sin(rad));
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const p = pixel(x, y);
      acc[0] += p[0]; acc[1] += p[1]; acc[2] += p[2];
      n++;
    }
    samples.push(acc.map((v) => v / n));
  }

  // --- 2. 4色にクラスタリング (k-means) ---
  // 初期値は上下左右4方向の色
  let centers = [0, 90, 180, 270].map(
    (deg) => samples[Math.round((deg / 360) * STEPS) % STEPS]
  );
  const assign = new Array(STEPS).fill(0);
  for (let iter = 0; iter < 100; iter++) {
    for (let s = 0; s < STEPS; s++) {
      let best = 0;
      let bd = Infinity;
      centers.forEach((c, i) => {
        const d = dist(samples[s], c);
        if (d < bd) { bd = d; best = i; }
      });
      assign[s] = best;
    }
    const next = centers.map(() => [0, 0, 0, 0]);
    for (let s = 0; s < STEPS; s++) {
      const t = next[assign[s]];
      t[0] += samples[s][0]; t[1] += samples[s][1]; t[2] += samples[s][2]; t[3]++;
    }
    centers = next.map((t) => [t[0] / t[3], t[1] / t[3], t[2] / t[3]]);
  }

  // 円周方向に平滑化 (境界のギザギザとグラデーションの揺れを消す)
  const smooth = assign.slice();
  for (let s = 0; s < STEPS; s++) {
    const count = [0, 0, 0, 0];
    for (let k = -3; k <= 3; k++) count[assign[(s + k + STEPS) % STEPS]]++;
    smooth[s] = count.indexOf(Math.max(...count));
  }

  // --- 3. 扇形 (開始角度・終了角度・色) を取り出す ---
  const sectors = [];
  let start = 0;
  for (let s = 1; s <= STEPS; s++) {
    if (smooth[s % STEPS] !== smooth[start]) {
      sectors.push({
        color: centers[smooth[start]].map(Math.round),
        from: (start / STEPS) * 360,
        to: (s / STEPS) * 360,
      });
      start = s;
    }
  }
  // 最後のラン (360度まで) を閉じる
  sectors.push({
    color: centers[smooth[start]].map(Math.round),
    from: (start / STEPS) * 360,
    to: 360,
  });
  // 先頭と末尾が同じ色なら1つに繋げる (0度をまたぐ扇形)
  if (sectors.length > 1 &&
      dist(sectors[0].color, sectors[sectors.length - 1].color) < 1) {
    const last = sectors.pop();
    sectors[0].from = last.from - 360;
  }

  const hex = (c) =>
    '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  console.log('検出した扇形:');
  for (const s of sectors) {
    const span = s.to - s.from;
    console.log(
      `  ${hex(s.color)}  角度 ${s.from.toFixed(1)}°〜${s.to.toFixed(1)}°` +
      `  割合 ${(span / 360 * 100).toFixed(1)}%`
    );
  }

  // --- 4. 中心から角度で塗り分けて描画 ---
  const out = Buffer.alloc(W * H * 4);
  const sectorAt = (deg) => {
    for (const s of sectors) {
      if (deg >= s.from && deg < s.to) return s.color;
      if (deg + 360 >= s.from && deg + 360 < s.to) return s.color;
    }
    return sectors[0].color;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const deg =
        ((Math.atan2(y - cy, x - cx) * 180) / Math.PI + 360) % 360;
      const c = sectorAt(deg);
      const i = (y * W + x) * 4;
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
    }
  }

  await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile(output);
  console.log(`書き出しました: ${output}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
