const text = document.querySelector('#sample-text');
const specimen = document.querySelector('#specimen');
const weight = document.querySelector('#weight');
const size = document.querySelector('#size');
const weightValue = document.querySelector('#weight-value');
const sizeValue = document.querySelector('#size-value');
const status = document.querySelector('#font-status');
const sampleButtons = document.querySelectorAll('[data-sample]');

const samples = {
  mixed: text.defaultValue,
  japanese: '人類社会のすべての構成員の固有の尊厳と平等で譲ることのできない権利とを承認することは',
  latin: 'Nottsu Sans JP\nThe quick brown fox jumps over the lazy dog.\n0123456789',
};

function updatePreview() {
  specimen.textContent = text.value;
  specimen.style.setProperty('--sample-weight', weight.value);
  specimen.style.setProperty('--sample-size', `${size.value}px`);
  weightValue.value = weight.value;
  sizeValue.value = `${size.value}px`;
  for (const button of sampleButtons) {
    button.setAttribute('aria-pressed', String(samples[button.dataset.sample] === text.value));
  }
}

for (const control of [text, weight, size]) control.addEventListener('input', updatePreview);

for (const button of sampleButtons) {
  button.addEventListener('click', () => {
    text.value = samples[button.dataset.sample];
    updatePreview();
  });
}

document.querySelector('#reset').addEventListener('click', () => {
  text.value = samples.mixed;
  weight.value = weight.defaultValue;
  size.value = size.defaultValue;
  updatePreview();
});

updatePreview();

document.fonts.load('400 24px "Nottsu Sans JP"').then((fonts) => {
  if (fonts.length === 0) throw new Error('The font is unavailable.');
  if (CSS.supports('font-tech(color-COLRv1)')) {
    status.hidden = true;
  } else {
    status.textContent = 'Color rendering requires a browser with COLR v1 support.';
  }
}).catch(() => {
  status.textContent = 'The font could not be loaded. Reload to try again.';
});
