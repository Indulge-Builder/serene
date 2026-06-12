type FormNoticeProps = {
  kind:     "error" | "success";
  children: React.ReactNode;
};

const TONES = {
  error: {
    background: "var(--color-danger-light)",
    border:     "1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)",
    color:      "var(--color-danger-text)",
  },
  success: {
    background: "var(--color-success-light)",
    border:     "1px solid color-mix(in srgb, var(--color-success) 25%, transparent)",
    color:      "var(--color-success-text)",
  },
} as const;

/** Inline form feedback banner — shared by the profile forms. */
export function FormNotice({ kind, children }: FormNoticeProps) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      style={{
        padding:      "var(--space-3) var(--space-4)",
        borderRadius: "var(--radius-sm)",
        fontFamily:   "var(--font-sans)",
        fontSize:     "var(--text-sm)",
        ...TONES[kind],
      }}
    >
      {children}
    </div>
  );
}
