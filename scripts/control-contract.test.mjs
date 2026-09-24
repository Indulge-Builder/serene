import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '../src/components/ui/Button.tsx';

const render = (props, children = 'Action') => renderToStaticMarkup(React.createElement(Button, props, children));

test('toolbar migration preserves native button and popup semantics', () => {
  const html = render({ variant: 'control', type: 'button', 'aria-expanded': true, 'aria-haspopup': 'menu', 'aria-label': 'Columns' });
  assert.match(html, /type="button"/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, /aria-label="Columns"/);
});

test('submit actions retain type, name and value for forms', () => {
  const html = render({ type: 'submit', name: 'intent', value: 'save' }, 'Save');
  assert.match(html, /type="submit"/);
  assert.match(html, /name="intent"/);
  assert.match(html, /value="save"/);
});

test('applied control state does not leak custom props into the DOM', () => {
  const html = render({ variant: 'control', active: true, 'aria-pressed': true });
  assert.match(html, /aria-pressed="true"/);
  assert.doesNotMatch(html, / active=/);
  assert.doesNotMatch(html, / variant=/);
});

test('disabled toolbar actions remain natively disabled', () => {
  assert.match(render({ variant: 'control', disabled: true }), / disabled=""/);
  assert.doesNotMatch(render({ variant: 'control' }), / disabled=/);
});

test('pending actions announce busy state and prevent repeated activation', () => {
  const html = render({ loading: true, loadingLabel: 'Saving…' }, 'Save');
  assert.match(html, / disabled=""/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Saving…/);
  assert.doesNotMatch(render({}), /aria-busy="true"/);
});

test('icon-only actions retain an accessible name without visible text', () => {
  const html = render({ variant: 'ghost', iconOnly: true, 'aria-label': 'Close dialog' }, null);
  assert.match(html, /aria-label="Close dialog"/);
  assert.doesNotMatch(html, / iconOnly=/);
});

test('selection controls preserve listbox option semantics and native form safety', async () => {
  const { SelectionButton } = await import('../src/components/ui/SelectionButton.tsx');
  const html = renderToStaticMarkup(React.createElement(SelectionButton, { selected: true, role: 'option', 'aria-selected': true, tabIndex: -1 }, 'Selected option'));
  assert.match(html, /type="button"/);
  assert.match(html, /role="option"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /tabindex="-1"/);
  assert.doesNotMatch(html, /aria-pressed=/);
});

test('disabled selection rows retain their native disabled state and accessible name', async () => {
  const { SelectionButton } = await import('../src/components/ui/SelectionButton.tsx');
  const html = renderToStaticMarkup(React.createElement(SelectionButton, { appearance: 'row', disabled: true, 'aria-label': 'Unavailable vendor' }));
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-label="Unavailable vendor"/);
});

test('busy upload controls prevent repeat activation and preserve form safety', async () => {
  const { UploadButton } = await import('../src/components/ui/UploadButton.tsx');
  const html = renderToStaticMarkup(React.createElement(UploadButton, { busy: true, 'aria-label': 'Upload video' }, 'Uploading…'));
  assert.match(html, /type="button"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /aria-label="Upload video"/);
  const idle = renderToStaticMarkup(React.createElement(UploadButton, null, 'Choose file'));
  assert.doesNotMatch(idle, /disabled=|aria-busy=/);
});

test('mobile material consolidation preserves native submit and disabled attributes', async () => {
  const { MobileButton, IconKnob } = await import('../src/components/mobile/buttons.tsx');
  const html = renderToStaticMarkup(React.createElement(MobileButton, { variant: 'primary', type: 'submit', name: 'intent', value: 'save', disabled: true }, 'Save'));
  assert.match(html, /type="submit"/);
  assert.match(html, /name="intent"/);
  assert.match(html, /value="save"/);
  assert.match(html, /disabled=""/);
  const knob = renderToStaticMarkup(React.createElement(IconKnob, { size: 40, type: 'button', 'aria-label': 'More' }, '+'));
  assert.match(knob, /width:40px/);
  assert.match(knob, /aria-label="More"/);
});


test('field family associates labels, hints and errors without losing native attributes', async () => {
  const { Field, Input } = await import('../src/components/ui/Field.tsx');
  const html = renderToStaticMarkup(React.createElement(Field, { label: 'Email', htmlFor: 'email', hint: 'Work address', error: 'Enter an email', required: true }, React.createElement(Input, { name: 'email', type: 'email', 'aria-describedby': 'external-hint', defaultValue: 'a@b.com' })));
  assert.match(html, /for="email"/);
  assert.match(html, /id="email"/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="external-hint email-hint email-error"/);
  assert.match(html, /required=""/);
  assert.match(html, /name="email"/);
  assert.match(html, /value="a@b.com"/);
  assert.match(html, /id="email-error"[^>]*role="alert"/);
});

test('field controls preserve read-only, disabled, and native selection semantics', async () => {
  const { Input, Select, Textarea } = await import('../src/components/ui/Field.tsx');
  assert.match(renderToStaticMarkup(React.createElement(Input, { readOnly: true, defaultValue: 'Existing' })), /readOnly=""/);
  assert.match(renderToStaticMarkup(React.createElement(Textarea, { disabled: true, name: 'notes', defaultValue: 'Keep these notes' })), /disabled=""[^>]*name="notes"[^>]*>Keep these notes/);
  const html = renderToStaticMarkup(React.createElement(Select, { name: 'status', defaultValue: 'open' }, React.createElement('option', { value: 'open' }, 'Open')));
  assert.match(html, /name="status"/);
  assert.match(html, /value="open" selected=""/);
});

test('persistent feedback announces failures and keeps informational status polite', async () => {
  const { Alert } = await import('../src/components/ui/Alert.tsx');
  assert.match(renderToStaticMarkup(React.createElement(Alert, { tone: 'danger' }, 'Try again')), /role="alert"/);
  assert.match(renderToStaticMarkup(React.createElement(Alert, { tone: 'success' }, 'Saved')), /role="status"/);
});
