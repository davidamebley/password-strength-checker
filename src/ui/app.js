// Wiring between the DOM and the scoring engine. The engine itself knows nothing
// about the page, and nothing here logs, stores, or sends a password anywhere.

import { evaluatePassword } from '../scoring/index.js';
import { LENGTH, generatePassword } from './generator.js';
import { createThemeController } from './theme.js';

const CATEGORY_SLUGS = {
  'Very Weak': 'very-weak',
  Weak: 'weak',
  Fair: 'fair',
  Strong: 'strong',
  'Very Strong': 'very-strong',
};

const STATUS_DURATION = 2500;
// Typing changes the score on every keystroke. Announcing each one would drown a screen
// reader, so only the value the user settles on is sent to the live region.
const ANNOUNCE_DELAY = 700;
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// `hidden` is an HTMLElement property, so inline SVG icons need the attribute itself.
function setHidden(element, hidden) {
  element.toggleAttribute('hidden', hidden);
}

function renderList(list, items) {
  list.replaceChildren(
    ...items.map((text) => {
      const item = list.ownerDocument.createElement('li');
      item.textContent = text;
      return item;
    }),
  );
  setHidden(list, items.length === 0);
}

export function initApp(doc = document) {
  const el = (id) => doc.getElementById(id);

  const passwordInput = el('password');
  const revealButton = el('reveal-button');
  const eyeIcon = el('icon-eye');
  const eyeOffIcon = el('icon-eye-off');
  const mirrorToggle = el('mirror-toggle');
  const mirrorOutput = el('mirror-output');

  const result = el('result');
  const meter = el('meter');
  const meterFill = el('meter-fill');
  const categoryOutput = el('category');
  const scoreOutput = el('score');
  const resultSummary = el('result-summary');
  const emptyHint = el('empty-hint');
  const suggestions = el('suggestions');
  const findings = el('findings');
  const findingsList = el('findings-list');

  const generatedOutput = el('generated');
  const lengthInput = el('length');
  const lengthValue = el('length-value');
  const setInputs = [...doc.querySelectorAll('[data-set]')];
  const generateButton = el('generate-button');
  const copyButton = el('copy-button');
  const useButton = el('use-button');
  const generatorStatus = el('generator-status');

  const themeToggle = el('theme-toggle');
  const themeLabel = el('theme-label');
  const sunIcon = el('theme-icon-sun');
  const moonIcon = el('theme-icon-moon');

  const tipsButton = el('tips-button');
  const tipsPopover = el('tips-popover');
  const privacyButton = el('privacy-button');
  const privacyOverlay = el('privacy-overlay');
  const privacyDialog = el('privacy-dialog');
  const privacyClose = el('privacy-close');

  // Strength result

  let announceTimer;
  function announce(message) {
    clearTimeout(announceTimer);
    if (message === '') {
      resultSummary.textContent = '';
      return;
    }
    announceTimer = setTimeout(() => {
      resultSummary.textContent = message;
    }, ANNOUNCE_DELAY);
  }

  function render(password) {
    const { score, category, findings: found, suggestions: advice } = evaluatePassword(password);
    const empty = password === '';

    result.dataset.state = empty ? 'empty' : 'rated';
    result.dataset.category = empty ? 'none' : CATEGORY_SLUGS[category];

    meter.setAttribute('aria-valuenow', String(empty ? 0 : score));
    meter.setAttribute(
      'aria-valuetext',
      empty ? 'No password entered' : `${score} out of 100, ${category}`,
    );
    meterFill.style.width = `${empty ? 0 : score}%`;

    categoryOutput.textContent = empty ? 'Not rated' : category;
    setHidden(scoreOutput, empty);
    scoreOutput.textContent = empty ? '' : `${score} / 100`;
    announce(empty ? '' : `${category}, ${score} out of 100`);
    setHidden(emptyHint, !empty);

    renderList(suggestions, empty ? [] : advice);
    renderList(
      findingsList,
      found.map((finding) => finding.message),
    );
    setHidden(findings, empty || found.length === 0);
    if (findings.hidden) {
      findings.open = false;
    }
  }

  function syncMirror() {
    setHidden(mirrorOutput, !mirrorToggle.checked);
    mirrorOutput.value = mirrorToggle.checked ? passwordInput.value : '';
  }

  function update() {
    syncMirror();
    render(passwordInput.value);
  }

  passwordInput.addEventListener('input', update);
  mirrorToggle.addEventListener('change', syncMirror);

  revealButton.addEventListener('click', () => {
    const revealed = passwordInput.type === 'password';
    passwordInput.type = revealed ? 'text' : 'password';
    revealButton.setAttribute('aria-label', revealed ? 'Hide password' : 'Show password');
    setHidden(eyeIcon, revealed);
    setHidden(eyeOffIcon, !revealed);
    passwordInput.focus();
  });

  // Generator

  function selectedSets() {
    return setInputs.filter((input) => input.checked).map((input) => input.dataset.set);
  }

  let statusTimer;
  function showStatus(message) {
    generatorStatus.textContent = message;
    generatorStatus.dataset.visible = 'true';
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      generatorStatus.textContent = '';
      delete generatorStatus.dataset.visible;
    }, STATUS_DURATION);
  }

  // Paints the filled part of the range track, which CSS alone cannot follow.
  function syncLength() {
    const { min, max, value } = lengthInput;
    const filled = ((Number(value) - Number(min)) / (Number(max) - Number(min))) * 100;
    lengthInput.style.setProperty('--range-progress', `${filled}%`);
    lengthValue.textContent = value;
  }

  function generate() {
    try {
      generatedOutput.value = generatePassword({
        length: Number(lengthInput.value),
        sets: selectedSets(),
      });
    } catch (error) {
      generatedOutput.value = '';
      showStatus(error.message);
    }
  }

  lengthInput.addEventListener('input', syncLength);
  lengthInput.addEventListener('change', generate);

  setInputs.forEach((input) => {
    input.addEventListener('change', () => {
      if (selectedSets().length === 0) {
        input.checked = true;
        showStatus('Keep at least one character type.');
        return;
      }
      generate();
    });
  });

  generateButton.addEventListener('click', generate);

  copyButton.addEventListener('click', async () => {
    if (generatedOutput.value === '') {
      showStatus('Generate a password first.');
      return;
    }
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('unavailable');
      }
      await navigator.clipboard.writeText(generatedOutput.value);
      showStatus('Copied');
    } catch {
      showStatus('Copy is unavailable. Select the password and copy it.');
    }
  });

  useButton.addEventListener('click', () => {
    if (generatedOutput.value === '') {
      showStatus('Generate a password first.');
      return;
    }
    passwordInput.value = generatedOutput.value;
    update();
    showStatus('Added to the password field.');
  });

  // Theme

  const theme = createThemeController(doc.documentElement);

  function syncTheme() {
    const dark = theme.get() === 'dark';
    // The visible label names the mode the button switches to, and the accessible name repeats it.
    themeLabel.textContent = dark ? 'Light mode' : 'Dark mode';
    themeToggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    setHidden(sunIcon, !dark);
    setHidden(moonIcon, dark);
  }

  themeToggle.addEventListener('click', () => {
    theme.toggle();
    syncTheme();
  });

  // Tips popover

  let tipsPinned = false;
  let tipsHovered = false;
  let tipsFocused = false;
  // Set when the tips are dismissed while the pointer or focus is still on the trigger,
  // so Escape can close them without taking focus away from the button.
  let tipsDismissed = false;

  function syncTips() {
    const open = !tipsDismissed && (tipsPinned || tipsHovered || tipsFocused);
    setHidden(tipsPopover, !open);
    tipsButton.setAttribute('aria-expanded', String(open));
  }

  tipsButton.addEventListener('click', () => {
    // Dismissing already unpins, so a click after Escape opens the tips again.
    tipsPinned = !tipsPinned;
    tipsDismissed = false;
    syncTips();
  });
  tipsButton.addEventListener('mouseenter', () => {
    tipsHovered = true;
    tipsDismissed = false;
    syncTips();
  });
  tipsButton.addEventListener('mouseleave', () => {
    tipsHovered = false;
    tipsDismissed = false;
    syncTips();
  });
  tipsButton.addEventListener('focus', () => {
    tipsFocused = true;
    tipsDismissed = false;
    syncTips();
  });
  tipsButton.addEventListener('blur', () => {
    tipsFocused = false;
    tipsDismissed = false;
    syncTips();
  });

  function closeTips() {
    tipsPinned = false;
    tipsDismissed = true;
    syncTips();
  }

  // Privacy dialog

  let lastFocused = null;

  function openPrivacy() {
    lastFocused = doc.activeElement;
    closeTips();
    setHidden(privacyOverlay, false);
    privacyButton.setAttribute('aria-expanded', 'true');
    privacyClose.focus();
  }

  function closePrivacy() {
    setHidden(privacyOverlay, true);
    privacyButton.setAttribute('aria-expanded', 'false');
    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus();
    }
  }

  privacyButton.addEventListener('click', openPrivacy);
  privacyClose.addEventListener('click', closePrivacy);
  privacyOverlay.addEventListener('mousedown', (event) => {
    if (event.target === privacyOverlay) {
      closePrivacy();
    }
  });

  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!privacyOverlay.hidden) {
        closePrivacy();
      } else {
        closeTips();
      }
      return;
    }

    if (event.key === 'Tab' && !privacyOverlay.hidden) {
      const focusable = [...privacyDialog.querySelectorAll(FOCUSABLE)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  // Initial state

  lengthInput.min = String(LENGTH.min);
  lengthInput.max = String(LENGTH.max);
  syncLength();
  syncTheme();
  syncTips();
  update();
  generate();
}
