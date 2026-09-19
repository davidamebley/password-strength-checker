// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
// The tests drive the real page markup, so the wiring and the document cannot drift apart.
import PAGE from '../../index.html?raw';
import { initApp } from '../../src/ui/app.js';
import { CHARACTER_SETS } from '../../src/ui/generator.js';

const BODY = PAGE.slice(PAGE.indexOf('<body>') + '<body>'.length, PAGE.indexOf('</body>'));

const $ = (id) => document.getElementById(id);

function type(value) {
  const input = $('password');
  input.value = value;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
}

function setChecked(id, checked) {
  const input = $(id);
  input.checked = checked;
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function pressEscape() {
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = BODY;
  initApp(document);
});

describe('empty state', () => {
  it('stays calm before anything is typed', () => {
    expect($('category').textContent).toBe('Not rated');
    expect($('score').hidden).toBe(true);
    expect($('meter').getAttribute('aria-valuenow')).toBe('0');
    expect($('empty-hint').hidden).toBe(false);
    expect($('suggestions').hidden).toBe(true);
    expect($('findings').hidden).toBe(true);
  });

  it('returns to the empty state when the password is cleared', () => {
    type('password');
    expect($('empty-hint').hidden).toBe(true);

    type('');
    expect($('category').textContent).toBe('Not rated');
    expect($('score').hidden).toBe(true);
    expect($('empty-hint').hidden).toBe(false);
    expect($('findings').hidden).toBe(true);
  });
});

describe('real time evaluation', () => {
  it('scores a weak password as the user types', () => {
    type('password');

    expect($('category').textContent).toBe('Very Weak');
    expect($('score').hidden).toBe(false);
    expect($('score').textContent).toMatch(/^\d+ \/ 100$/);
    expect($('result').dataset.category).toBe('very-weak');
    expect($('meter').getAttribute('aria-valuenow')).toBe($('score').textContent.split(' ')[0]);
    expect($('meter').getAttribute('aria-valuetext')).toContain('Very Weak');
  });

  it('scores a long passphrase far higher than a weak password', () => {
    type('password');
    const weak = Number($('meter').getAttribute('aria-valuenow'));

    type('velvet orbit maple tundra');
    const strong = Number($('meter').getAttribute('aria-valuenow'));

    expect(strong).toBeGreaterThan(weak);
    expect($('category').textContent).not.toBe('Very Weak');
    expect($('meter-fill').style.width).toBe(`${strong}%`);
  });

  it('shows findings behind the details control only when there are any', () => {
    type('aaaaaaaa');
    expect($('findings').hidden).toBe(false);
    expect($('findings-list').children.length).toBeGreaterThan(0);

    type('velvet orbit maple tundra');
    expect($('findings').hidden).toBe(true);
  });

  it('shows at most the suggestions the engine provides', () => {
    type('qwerty2026');
    expect($('suggestions').children.length).toBeGreaterThan(0);
    expect($('suggestions').children.length).toBeLessThanOrEqual(3);
  });
});

describe('password input and plain text mirror', () => {
  it('mirrors the typed password by default', () => {
    expect($('mirror-toggle').checked).toBe(true);
    expect($('mirror-output').hidden).toBe(false);

    type('hunter apple');
    expect($('mirror-output').value).toBe('hunter apple');
  });

  it('hides the mirror when the toggle is switched off, without changing the password', () => {
    type('hunter apple');

    setChecked('mirror-toggle', false);
    expect($('mirror-output').hidden).toBe(true);
    expect($('mirror-output').value).toBe('');
    expect($('password').value).toBe('hunter apple');

    setChecked('mirror-toggle', true);
    expect($('mirror-output').hidden).toBe(false);
    expect($('mirror-output').value).toBe('hunter apple');
  });

  it('keeps the masked field and the mirror independent', () => {
    type('hunter apple');

    expect($('icon-eye').hasAttribute('hidden')).toBe(false);
    expect($('icon-eye-off').hasAttribute('hidden')).toBe(true);

    $('reveal-button').click();
    expect($('password').type).toBe('text');
    expect($('reveal-button').getAttribute('aria-label')).toBe('Hide password');
    // Checked as attributes: `hidden` as a property does nothing on an inline SVG element.
    expect($('icon-eye').hasAttribute('hidden')).toBe(true);
    expect($('icon-eye-off').hasAttribute('hidden')).toBe(false);
    expect($('mirror-output').value).toBe('hunter apple');

    $('reveal-button').click();
    expect($('password').type).toBe('password');
    expect($('reveal-button').getAttribute('aria-label')).toBe('Show password');
    expect($('password').value).toBe('hunter apple');
  });
});

describe('generator', () => {
  it('fills an initial password on load', () => {
    expect($('generated').value).toHaveLength(16);
  });

  it('respects the selected length and character sets', () => {
    setChecked('set-uppercase', false);
    setChecked('set-symbols', false);

    $('length').value = '12';
    $('length').dispatchEvent(new window.Event('input', { bubbles: true }));
    $('length').dispatchEvent(new window.Event('change', { bubbles: true }));

    const allowed = `${CHARACTER_SETS.lowercase}${CHARACTER_SETS.numbers}`;
    const value = $('generated').value;

    expect($('length-value').textContent).toBe('12');
    expect(value).toHaveLength(12);
    expect([...value].every((char) => allowed.includes(char))).toBe(true);
  });

  it('generates a new password on request', () => {
    const first = $('generated').value;
    $('generate-button').click();
    expect($('generated').value).not.toBe(first);
  });

  it('keeps at least one character set selected', () => {
    setChecked('set-uppercase', false);
    setChecked('set-numbers', false);
    setChecked('set-symbols', false);
    setChecked('set-lowercase', false);

    expect($('set-lowercase').checked).toBe(true);
    expect($('generator-status').textContent).toBe('Keep at least one character type.');
    expect($('generated').value).not.toBe('');
  });

  it('copies through the Clipboard API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    $('copy-button').click();

    await vi.waitFor(() => expect($('generator-status').textContent).toBe('Copied'));
    expect(writeText).toHaveBeenCalledWith($('generated').value);
  });

  it('puts the generated password in the field, evaluates it, and leaves the settings alone', () => {
    const settings = {
      length: $('length').value,
      sets: [...document.querySelectorAll('[data-set]')].map((input) => input.checked),
    };

    $('use-button').click();
    const generated = $('generated').value;

    expect($('password').value).toBe(generated);
    expect($('mirror-output').value).toBe(generated);
    expect($('category').textContent).not.toBe('Not rated');
    expect(Number($('meter').getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    expect($('length').value).toBe(settings.length);
    expect([...document.querySelectorAll('[data-set]')].map((input) => input.checked)).toEqual(
      settings.sets,
    );
  });
});

describe('theme', () => {
  it('starts light without a colour scheme preference and toggles', () => {
    expect(document.documentElement.dataset.theme).toBe('light');
    expect($('theme-label').textContent).toBe('Dark mode');
    expect($('theme-toggle').getAttribute('aria-label')).toBe('Switch to dark mode');

    $('theme-toggle').click();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect($('theme-label').textContent).toBe('Light mode');
    expect($('theme-toggle').getAttribute('aria-label')).toBe('Switch to light mode');
    expect($('theme-icon-sun').hasAttribute('hidden')).toBe(false);
    expect($('theme-icon-moon').hasAttribute('hidden')).toBe(true);

    $('theme-toggle').click();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect($('theme-label').textContent).toBe('Dark mode');
  });

  it('keeps the visible label inside the accessible name', () => {
    const matches = () =>
      $('theme-toggle')
        .getAttribute('aria-label')
        .toLowerCase()
        .includes($('theme-label').textContent.toLowerCase());

    expect(matches()).toBe(true);
    $('theme-toggle').click();
    expect(matches()).toBe(true);
  });
});

describe('privacy and tips', () => {
  it('opens the privacy dialog, moves focus into it, and closes on Escape', () => {
    $('privacy-button').focus();
    $('privacy-button').click();

    expect($('privacy-overlay').hidden).toBe(false);
    expect($('privacy-button').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe($('privacy-close'));

    pressEscape();

    expect($('privacy-overlay').hidden).toBe(true);
    expect($('privacy-button').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe($('privacy-button'));
  });

  it('closes the privacy dialog with its close button', () => {
    $('privacy-button').click();
    $('privacy-close').click();
    expect($('privacy-overlay').hidden).toBe(true);
  });

  it('shows tips on focus and on click, and hides them on Escape', () => {
    expect($('tips-popover').hidden).toBe(true);

    $('tips-button').focus();
    expect($('tips-popover').hidden).toBe(false);
    expect($('tips-button').getAttribute('aria-expanded')).toBe('true');

    pressEscape();
    expect($('tips-popover').hidden).toBe(true);

    $('tips-button').click();
    expect($('tips-popover').hidden).toBe(false);
  });
});

describe('edge cases', () => {
  it('survives rapid typing and deleting back to empty', () => {
    for (const value of ['v', 've', 'vel', 'velv', 'velve', 'velvet', 'velvet ', 'velvet o']) {
      type(value);
    }
    expect($('category').textContent).not.toBe('Not rated');

    for (const value of ['velvet', 'vel', 'v', '']) {
      type(value);
    }
    expect($('category').textContent).toBe('Not rated');
    expect($('score').hidden).toBe(true);
    expect($('meter').getAttribute('aria-valuenow')).toBe('0');
    expect($('mirror-output').value).toBe('');
  });

  it('handles a pasted thousand-character password', () => {
    const long = 'velvet orbit maple tundra '.repeat(40).slice(0, 1000);
    type(long);

    expect($('mirror-output').value).toHaveLength(1000);
    expect(Number($('meter').getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  });

  it('caps what can be typed into the password field', () => {
    expect(Number($('password').getAttribute('maxlength'))).toBeGreaterThanOrEqual(1000);
  });

  it('keeps the two visibility controls stable when toggled repeatedly', () => {
    type('hunter apple');

    for (let i = 0; i < 5; i += 1) {
      $('reveal-button').click();
      setChecked('mirror-toggle', false);
      $('reveal-button').click();
      setChecked('mirror-toggle', true);
    }

    expect($('password').type).toBe('password');
    expect($('password').value).toBe('hunter apple');
    expect($('reveal-button').getAttribute('aria-label')).toBe('Show password');
    expect($('icon-eye').hasAttribute('hidden')).toBe(false);
    expect($('mirror-output').hidden).toBe(false);
    expect($('mirror-output').value).toBe('hunter apple');
  });

  it('uses the generated password while the mirror is hidden without revealing it', () => {
    setChecked('mirror-toggle', false);
    $('use-button').click();

    expect($('password').value).toBe($('generated').value);
    expect($('mirror-output').hidden).toBe(true);
    expect($('mirror-output').value).toBe('');
    expect($('category').textContent).not.toBe('Not rated');
  });

  it('keeps generator settings when the length changes after a generation', () => {
    setChecked('set-symbols', false);
    const sets = [...document.querySelectorAll('[data-set]')].map((input) => input.checked);

    $('length').value = '32';
    $('length').dispatchEvent(new window.Event('input', { bubbles: true }));
    $('length').dispatchEvent(new window.Event('change', { bubbles: true }));

    expect($('generated').value).toHaveLength(32);
    expect($('length-value').textContent).toBe('32');
    expect([...document.querySelectorAll('[data-set]')].map((input) => input.checked)).toEqual(
      sets,
    );
  });

  it('reports a copy failure instead of claiming success', async () => {
    Object.defineProperty(window.navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
      configurable: true,
    });

    $('copy-button').click();

    await vi.waitFor(() =>
      expect($('generator-status').textContent).toBe(
        'Copy is unavailable. Select the password and copy it.',
      ),
    );
  });

  it('asks for a password before copying when there is nothing to copy', () => {
    $('generated').value = '';
    $('copy-button').click();
    expect($('generator-status').textContent).toBe('Generate a password first.');
  });

  it('opens and closes the privacy dialog repeatedly, restoring focus each time', () => {
    for (let i = 0; i < 3; i += 1) {
      $('privacy-button').focus();
      $('privacy-button').click();
      expect($('privacy-overlay').hidden).toBe(false);
      expect(document.activeElement).toBe($('privacy-close'));

      pressEscape();
      expect($('privacy-overlay').hidden).toBe(true);
      expect(document.activeElement).toBe($('privacy-button'));
    }
  });

  it('keeps focus on the tips trigger when Escape dismisses the tips', () => {
    $('tips-button').focus();
    expect($('tips-popover').hidden).toBe(false);

    pressEscape();

    expect($('tips-popover').hidden).toBe(true);
    expect($('tips-button').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe($('tips-button'));
  });
});

describe('strength announcements', () => {
  it('announces the settled result rather than every keystroke', async () => {
    vi.useFakeTimers();
    try {
      for (const value of ['v', 've', 'vel', 'velvet orbit maple tundra']) {
        type(value);
      }
      expect($('result-summary').textContent).toBe('');

      await vi.advanceTimersByTimeAsync(1000);
      expect($('result-summary').textContent).toMatch(/^Strong, \d+ out of 100$/);

      type('');
      expect($('result-summary').textContent).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });
});
