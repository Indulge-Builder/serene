"use client";

// Which number's conversations the inbox shows (0252): both, the Serene line, or the public Indulge
// line. A URL param (`?line=`) like the period filter, so the list, the search and a shared link
// agree.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Phone } from "lucide-react";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { WHATSAPP_LINES, WHATSAPP_LINE_LABELS, isWhatsAppLine } from "@/lib/constants/whatsapp-lines";

export function WhatsAppLineFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("line");
  const selected = isWhatsAppLine(current) ? [current] : [];

  function pick(next: string[]) {
    const q = new URLSearchParams(params.toString());
    const value = next[0];
    if (value && isWhatsAppLine(value)) q.set("line", value);
    else q.delete("line");
    const qs = q.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <FilterDropdown
      label="Number"
      icon={Phone}
      iconOnly
      items={WHATSAPP_LINES.map((l) => ({ id: l, label: WHATSAPP_LINE_LABELS[l] }))}
      selected={selected}
      onChange={pick}
      menuPortal
    />
  );
}
