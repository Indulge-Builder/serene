import { defineEnum } from "./define-enum";

const DEAL_TYPE_DEF = defineEnum([
  { id: "membership", label: "Membership" },
  { id: "retail",     label: "Retail"     },
]);

export const DEAL_TYPES = DEAL_TYPE_DEF.values;
export type DealType = (typeof DEAL_TYPES)[number];
export const DEAL_TYPE_LABELS = DEAL_TYPE_DEF.labels;

const DEAL_DURATION_DEF = defineEnum([
  { id: "3_months", label: "3 Months" },
  { id: "6_months", label: "6 Months" },
  { id: "1_year",   label: "1 Year"   },
]);

export const DEAL_DURATIONS = DEAL_DURATION_DEF.values;
export type DealDuration = (typeof DEAL_DURATIONS)[number];
export const DEAL_DURATION_LABELS = DEAL_DURATION_DEF.labels;
