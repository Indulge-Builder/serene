import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation, MotionConfig } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../src/components/ui/TabSelector';
import { FilterDropdown } from '../../src/components/ui/FilterDropdown';
import { DatePicker } from '../../src/components/ui/DatePicker';
import { TimePicker } from '../../src/components/ui/TimePicker';
import { Dialog } from '../../src/components/ui/Dialog';
import { ConfirmDialog } from '../../src/components/ui/ConfirmDialog';
import { Calendar } from '../../src/components/ui/Calendar';
import { SelectionButton } from '../../src/components/ui/SelectionButton';
import { FormSelect } from '../../src/components/ui/FormSelect';
import { Field, Input } from '../../src/components/ui/Field';
import { Tooltip } from '../../src/components/ui/Tooltip';
import { Table } from '../../src/components/ui/Table';

function Fixture() {
  const [formChoice, setFormChoice] = useState('');
  const [fieldValue, setFieldValue] = useState('');
  const [fieldBlurs, setFieldBlurs] = useState(0);
  const [pendingDialog, setPendingDialog] = useState(false);
  const [time, setTime] = useState<string | null>('10:30');
  const [pickerDate, setPickerDate] = useState<Date | null>(new Date(2026, 0, 31));
  const [dialog, setDialog] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [radio, setRadio] = useState('one');
  const [date, setDate] = useState(new Date(2026, 0, 31));
  const [single, setSingle] = useState<string[]>([]);
  const [multi, setMulti] = useState<string[]>([]);
  const [rows, setRows] = useState(0);
  const [actions, setActions] = useState(0);
  const [submits, setSubmits] = useState(0);
  const items = [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }, { id: 'three', label: 'Three' }];
  return <LazyMotion features={domAnimation}><MotionConfig reducedMotion="always">
    <form onSubmit={(e) => { e.preventDefault(); setSubmits(v => v + 1); }}>
      <Tabs defaultValue="one" animatedContent={false}>
        <TabsList><TabsTrigger value="one">First</TabsTrigger><TabsTrigger value="two" disabled>Disabled</TabsTrigger><TabsTrigger value="three">Last</TabsTrigger></TabsList>
        <TabsContent value="one">First panel</TabsContent><TabsContent value="three">Last panel</TabsContent>
      </Tabs>
    </form>
    <section id="single"><FilterDropdown label="Status" items={items} selected={single} onChange={setSingle} menuPortal /></section>
    <section id="multi"><FilterDropdown label="Outcomes" items={items} selected={multi} onChange={setMulti} multi /></section>
    <button id="after" type="button">After filters</button>
    <Table rows={[{ id: 'row' }]} rowKey={row => row.id} onRowClick={() => setRows(v => v + 1)} columns={[{id:'name',header:'Name',cell:()=> 'Record'}, {id:'action',header:'Action',cell:()=> <button id="nested" type="button" onClick={e=>{setActions(v=>v+1);}}>Nested action</button>}]} />
    <section id="calendar"><Calendar value={date} onSelect={setDate} /></section>
    <div role="radiogroup" aria-label="Choices" id="radio-group">{items.map(item => <SelectionButton key={item.id} role="radio" aria-checked={radio === item.id} selected={radio === item.id} onClick={() => setRadio(item.id)}>{item.label}</SelectionButton>)}</div>
    <button id="open-dialog" type="button" onClick={() => setDialog(true)}>Open dialog</button>
    <Dialog pending={pendingDialog} open={dialog} onClose={() => setDialog(false)} title="Review" footer={<button id="dialog-last" type="button">Last action</button>}>
      <button id="toggle-dialog-pending" type="button" onClick={() => setPendingDialog(value => !value)}>Toggle saving</button>
      <section id="dialog-filter"><FilterDropdown label="Dialog filter" items={items} selected={single} onChange={setSingle} menuPortal /></section>
      <section id="dialog-date"><DatePicker value={pickerDate} onChange={setPickerDate} /></section>
      <section id="dialog-time"><TimePicker value={time} onChange={setTime} /></section>
      <button id="open-confirm" type="button" onClick={() => setConfirm(true)}>Confirm action</button>
      <ConfirmDialog open={confirm} onCancel={() => setConfirm(false)} onConfirm={() => setConfirm(false)} title="Confirm action?" pending={pendingConfirm} body={<button id="toggle-pending" type="button" onClick={() => setPendingConfirm(value => !value)}>Toggle pending</button>} />
    </Dialog>
    <output id="modal-state">{JSON.stringify({ dialog, confirm, radio, date: date.getDate(), month: date.getMonth() })}</output>
    <section id="field-contract"><Field label="Email" htmlFor="fixture-email" hint="Work address" error={fieldValue.includes('@') ? undefined : 'Enter an email address'}><Input type="email" value={fieldValue} onChange={event => setFieldValue(event.target.value)} onBlur={() => setFieldBlurs(value => value + 1)} /></Field><output id="field-state">{JSON.stringify({fieldValue, fieldBlurs})}</output></section>
    <section id="form-select"><Field label="Assigned genie" htmlFor="fixture-genie" hint="Choose the owner" error={formChoice ? undefined : 'Pick an owner'}><FormSelect value={formChoice} onValueChange={setFormChoice}><option value="">Unassigned</option><><option value="ada">Ada</option><option value="away" disabled>Absent</option><option value="grace">Grace{' (genie)'}</option></></FormSelect></Field><output id="form-choice">{formChoice}</output></section>
    <section id="disabled-form-select"><FormSelect disabled aria-label="Unavailable owner" value="ada" onValueChange={setFormChoice}><option value="ada">Ada</option></FormSelect></section>
    <section id="disabled-filter"><FilterDropdown disabled label="Unavailable" items={items} selected={[]} onChange={setSingle} /></section>
    <section id="required-filter"><FilterDropdown clearable={false} ariaLabel="Required domain" label="Domain" items={items} selected={['one']} onChange={setSingle} /></section>
    <section id="refresh-table"><Table loading columns={[{id:'name',header:'Name',cell:()=>'Existing record'}]} rows={[{id:'retained'}]} rowKey={row=>row.id} /></section>
    <section id="initial-table"><Table loading columns={[{id:'name',header:'Name',cell:()=>''}]} rows={[]} rowKey={()=>'empty'} /></section>
    <Tooltip label="More about this action"><button id="tooltip-trigger" type="button" aria-describedby="existing-description">Help</button></Tooltip><p id="existing-description">Existing description</p>
    <output id="state">{JSON.stringify({ single, multi, rows, actions, submits })}</output>
  </MotionConfig></LazyMotion>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
