"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Wallet, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useMountOnFirstOpen } from "@/hooks/useMountOnFirstOpen";

// Load-on-intent (perf audit G-1): keep the recharge form out of the /budget
// initial bundle. Mirrors AdSpendUploadButton exactly.
const AddRechargeModal = dynamic(
  () => import("./AddRechargeModal").then((m) => m.AddRechargeModal),
  { ssr: false },
);

export function AddRechargeButton() {
  const [open, setOpen] = useState(false);
  const mounted = useMountOnFirstOpen(open);

  return (
    <>
      <Button
        variant="secondary"
        iconLeft={Wallet as LucideIcon}
        onClick={() => setOpen(true)}
      >
        Add Recharge
      </Button>
      {mounted && <AddRechargeModal open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
