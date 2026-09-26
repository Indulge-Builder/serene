#!/usr/bin/env node
// Generate a local specimen from the actual Button and material recipes.
// Run: node --import tsx scripts/preview-ui-controls.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SelectionButton } from '../src/components/ui/SelectionButton.tsx';
import { UploadButton } from '../src/components/ui/UploadButton.tsx';
import { MobileButton, IconKnob, Fab } from '../src/components/mobile/buttons.tsx';
import { FormSelect } from '../src/components/ui/FormSelect.tsx';
import { Field, Input, Textarea, Select } from '../src/components/ui/Field.tsx';
import { Badge } from '../src/components/ui/Badge.tsx';
import { Alert } from '../src/components/ui/Alert.tsx';
import { LoadingState } from '../src/components/ui/LoadingState.tsx';
import { SectionCard } from '../src/components/ui/SectionCard.tsx';
import { Button } from '../src/components/ui/Button.tsx';
import { filterTriggerStyle, clayTileStyle } from '../src/components/ui/material-styles.ts';
import { THEME_OPTIONS } from '../src/lib/constants/themes.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const postcss = createRequire(require.resolve('@tailwindcss/postcss'))('postcss');
const from = path.join(root, 'src/app/globals.css');
const result = await postcss([require('@tailwindcss/postcss')()]).process(fs.readFileSync(from, 'utf8'), { from });
const h = React.createElement;
const button = (variant, label, props = {}) => h(Button, { variant, type: 'button', ...props }, label);
const row = (...children) => h('div', { className: 'specimen-row' }, ...children);
const section = (title, ...children) => h('section', null, h('h2', null, title), ...children);
const content = renderToStaticMarkup(h('main', null,
  h('h1', null, 'Serene · Controls'),
  h('p', null, 'Live component specimens. Select a theme and appearance to compare the shared materials.'),
  section('Actions', row(button('primary', 'Create lead'), button('secondary', 'Export'), button('ghost', 'Cancel'), button('danger', 'Delete'), button('success', 'Confirm'), button('warning', 'Restore'), button('ghost-danger', 'Remove'))),
  section('Toolbar and filters', row(button('control', 'Newest first'), button('control', 'Columns', { 'aria-expanded': true }), button('control', 'Going cold', { active: true, 'aria-pressed': true }), h('button', { type: 'button', className: 'serene-filter-trigger specimen-filter', style: filterTriggerStyle(false) }, 'Status'), h('button', { type: 'button', className: 'serene-filter-trigger specimen-filter', style: filterTriggerStyle(true) }, 'Dates'))),
  section('States and sizes', row(button('control', 'Compact', {size: 'sm'}), button('control', 'Default'), button('control', 'Large', {size: 'lg'}), button('control', 'Unavailable', {disabled: true}), button('primary', 'Save', {loading: true, loadingLabel: 'Saving…'}))),
  section('Choices and options', ...['choice', 'option', 'row'].map(appearance => row(...[false, true].map(selected => h(SelectionButton, {appearance, selected, 'aria-pressed': selected, style: {padding: 'var(--space-2) var(--space-3)'}}, selected ? 'Selected' : 'Available')), h(SelectionButton, {appearance, disabled: true, style: {padding: 'var(--space-2) var(--space-3)'}}, 'Unavailable')))),
  section('Upload surface', h(UploadButton, null, 'Choose a file')),
  section('Touch action materials', row(h(MobileButton, {variant:'primary', type:'button'}, 'Continue'), h(MobileButton, {variant:'secondary', type:'button'}, 'Back'), h(MobileButton, {variant:'quiet', type:'button'}, 'Cancel'), h(IconKnob, {type:'button', 'aria-label':'Add'}, '+'), h(Fab, {type:'button', 'aria-label':'Create'}, '+'))),
  section('Fields', row(h('input', {className: 'serene-input specimen-input', 'aria-label': 'Search', placeholder: 'Search leads…'}), h('input', {className: 'serene-input specimen-input', 'aria-label': 'Disabled field', placeholder: 'Unavailable', disabled: true}))),
  section('Form families', row(
    h(Field, { label: 'Lead name', htmlFor: 'spec-name', required: true, hint: 'Use the name the lead prefers.' }, h(Input, { defaultValue: 'Ananya Rao' })),
    h(Field, { label: 'Email', htmlFor: 'spec-email', error: 'Enter a valid email address.' }, h(Input, { defaultValue: 'ananya@', type: 'email' })),
    h(Field, { label: 'Status', htmlFor: 'spec-status' }, h(Select, { defaultValue: 'open' }, h('option', { value: 'open' }, 'Open'))),
    h(Field, { label: 'Owner', htmlFor: 'spec-owner' }, h(FormSelect, { value: 'ada', onValueChange: () => {} }, h('option', { value: 'ada' }, 'Ada'))),
    h(Field, { label: 'Notes', htmlFor: 'spec-notes' }, h(Textarea, { placeholder: 'Add useful context…' }))
  )),
  section('Status and feedback', row(...['neutral','info','success','warning','danger'].map(tone => h(Badge, {tone}, tone))),
    ...['info','success','warning','danger'].map(tone => h(Alert, {tone, title: {info:'A little context',success:'Changes saved',warning:'Review before continuing',danger:'Changes could not be saved'}[tone]}, 'Your entries remain available while you review the next step.'))),
  section('Surface hierarchy', h(SectionCard, { title: 'Contact details', description: 'A quiet header separates sections without looking like a field.' }, h('p', null, 'Readable information on a porcelain card.'), h(LoadingState, {label:'Updating records…'}))),
  section('Data tiles' , row(...['sage','powder','lilac'].map((tone, i) => h('div', {className:'specimen-stat', style:clayTileStyle(`var(--neu-chip-${tone}-bg)`), key:tone}, h('span', null, ['Calls','Leads','Revenue'][i]), h('strong', null, ['128','42','₹2.4L'][i]))))),
));
const options = THEME_OPTIONS.map(({id,label}) => `<option value="${id}">${label}</option>`).join('');
const html = `<!doctype html><html lang="en" data-theme="earth"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Serene control system</title><style>${result.css}
body{margin:0;padding:24px;font-family:system-ui,sans-serif} .specimen-shell{display:grid;grid-template-columns:210px minmax(0,1fr);gap:20px;max-width:1120px;margin:auto} aside{padding:24px;background-color:var(--neu-sidebar);background-image:var(--neu-sidebar-gradient);border-radius:28px;color:var(--neu-sidebar-ink)} main{padding:32px;background:var(--neu-workspace);border-radius:28px;min-width:0} h1{font-size:28px;margin:0 0 12px} h2{font-size:16px;margin:0 0 16px} main>p,aside>p{font-size:14px;line-height:1.6;color:var(--neu-text-secondary)} section{margin-top:32px}.specimen-row{display:flex;flex-wrap:wrap;gap:12px;align-items:center}.specimen-row>.serene-field{flex:1 1 180px;align-self:flex-start}.serene-alert+.serene-alert{margin-top:12px}.specimen-filter{height:36px;padding:0 12px;font:500 14px system-ui;cursor:pointer}.specimen-input{width:220px;min-height:36px;border-radius:var(--neu-radius-control)}.specimen-stat{padding:20px;min-width:150px;display:grid;gap:12px}.specimen-stat span{font-size:12px}.specimen-stat strong{font-size:26px;font-variant-numeric:tabular-nums}aside select{display:block;width:100%;margin:8px 0 24px;padding:8px;background:var(--neu-surface);border:1px solid var(--neu-edge);border-radius:10px;color:var(--neu-text-primary)}@media(max-width:700px){body{padding:12px}.specimen-shell{grid-template-columns:1fr}main{padding:20px}}
</style></head><body><div class="specimen-shell"><aside><label for="theme">Theme</label><select id="theme">${options}</select><label for="appearance">Appearance</label><select id="appearance"><option value="light">Light</option><option value="dark">Dark</option></select><p>Tab through the controls to inspect keyboard focus. Hover and press use the app’s actual styles.</p></aside>${content}</div><script>document.getElementById('theme').onchange=e=>document.documentElement.dataset.theme=e.target.value;document.getElementById('appearance').onchange=e=>document.documentElement.dataset.neu=e.target.value;</script></body></html>`;
fs.mkdirSync(path.join(root, 'output'), {recursive:true});
fs.writeFileSync(path.join(root, 'output/serene-control-system.html'), html);
console.log('Rendered real components and compiled CSS: output/serene-control-system.html');
