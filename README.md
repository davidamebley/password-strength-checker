# Password Strength Checker

A client-side web application that evaluates password strength as you type. It scores a password
from 0 to 100 using an attacker-aware model rather than a simple character-class checklist, so
predictable choices such as `Password1!` are rated as weak even though they satisfy the usual
composition rules. Everything runs locally in the browser: no password is ever sent anywhere. The
app also includes a configurable generator that produces passwords from the Web Crypto API.

[Open the live Password Strength Checker](https://davidamebley.github.io/password-strength-checker/)

## Features

- Real-time strength score from 0 to 100
- Five strength categories: Very Weak, Weak, Fair, Strong, Very Strong
- Common-password and predictable-pattern detection
- Predictable substitution handling, so `P@ssw0rd` is treated like `password`
- Sequence, keyboard-pattern, and repetition detection
- Passphrase-aware scoring, so long everyday phrases are rated on word count
- Concise improvement suggestions, at most three at a time
- Optional plain-text mirror of the masked field, enabled by default
- Secure password generator using `crypto.getRandomValues`
- Configurable generator length (8 to 64) and character sets
- Light and dark themes
- Responsive, keyboard-accessible interface
- Local-only processing

## Scoring approach

The score starts from an estimate of how much work a guessing attack would need. Characters that
form no recognisable pattern contribute according to the size of the character pool they come
from; characters that belong to a detected pattern are charged only for the cost of guessing that
pattern, not for their raw length.

Attacker-aware penalties and ceilings are then applied:

- Passwords matching a common password, including case, substitution, and suffix variants, are
  capped severely. Appending `1!` or swapping `a` for `@` does not lift the cap.
- Structural patterns such as sequences, keyboard runs, repeated characters, and repeated blocks
  cap the score when they account for most of the password.
- Very short passwords and passwords built from very few distinct characters are capped.
- Phrase-shaped passwords are scored against a word-count-aware ceiling, so a two-word phrase
  cannot reach the top band however long it is, while a six-word passphrase can.

The result is a heuristic strength indicator. It is useful for steering people away from
predictable passwords, but it is not a guarantee of resistance to every cracking attack.

## Privacy

- Passwords are evaluated entirely in your browser.
- Passwords you enter or generate are not transmitted by the application.
- Passwords are not stored by the application. Nothing is written to local storage, session
  storage, cookies, or the URL, and closing or reloading the page clears the field.
- No analytics, telemetry, or third-party scripts are used.

## Tech stack

Vite, vanilla JavaScript, semantic HTML and CSS, Vitest, ESLint, Prettier. No runtime
dependencies.

## Local development

Requires Node.js 22.12 or later. The pinned version is in `.nvmrc`:

```bash
nvm use
npm install
npm run dev
```

The dev server prints a local URL to open.

## Quality commands

```bash
npm run test:run      # run the test suite once
npm run lint          # ESLint
npm run format:check  # Prettier check
npm run build         # production build into dist/
npm run preview       # serve the production build
```

## Project structure

```
index.html            application markup
src/
  main.js             entry point
  styles.css          theme tokens and layout
  scoring/            strength engine (no DOM, no I/O)
    index.js            evaluatePassword()
    categories.js       score bands
    detectors.js        pattern detectors
    common-passwords.js bundled common-password list
  ui/
    app.js              DOM wiring
    generator.js        password generator
    theme.js            light/dark theme control
tests/
  scoring/            engine and detector tests
  ui/                 generator and DOM tests
```

## Known limitations

- The score is a heuristic estimate, not a prediction of cracking time.
- The bundled common-password list is intentionally compact and covers frequently used base
  passwords rather than a full leaked-password corpus.
- No remote breach database is queried, which is a deliberate consequence of keeping everything
  local.
- There is no full dictionary, so the engine cannot judge the quality of ordinary words. Four
  unrelated words and four related words score the same.
- Input is limited to 1000 characters, which is the supported analysis size.

## Live demo

[Open the live Password Strength Checker](https://davidamebley.github.io/password-strength-checker/)
