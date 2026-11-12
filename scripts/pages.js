const fs = require('node:fs/promises');
const path = require('node:path');
const { distDirectory, fontFiles } = require('./build');

async function main() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'dist-pages');
  const docs = path.join(root, 'docs');
  const assets = path.join(output, 'assets');
  const font = fontFiles[0].output;
  const files = [
    [path.join(distDirectory, font), font],
    [path.join(distDirectory, 'OFL.txt'), 'OFL.txt'],
    [path.join(root, '0-color.png'), 'palette.png'],
  ];
  await Promise.all([path.join(docs, 'index.html'), ...files.map(([source]) => source)].map((source) => fs.access(source)));
  await fs.rm(output, { recursive: true, force: true });
  await fs.cp(docs, output, { recursive: true });
  await fs.mkdir(assets, { recursive: true });
  await Promise.all(files.map(([source, filename]) => fs.copyFile(source, path.join(assets, filename))));
  console.log(`Wrote ${path.relative(process.cwd(), output)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
