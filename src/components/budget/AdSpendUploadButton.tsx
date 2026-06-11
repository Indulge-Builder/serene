"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Upload, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useMountOnFirstOpen } from "@/hooks/useMountOnFirstOpen";

// Load-on-intent (perf audit G-1): the modal pulls in the xlsx parser chunk —
// keep it out of the /budget initial bundle.
const AdSpendUploadModal = dynamic(
  () => import("./AdSpendUploadModal").then((m) => m.AdSpendUploadModal),
  { ssr: false },
);

export function AdSpendUploadButton() {
  const [open, setOpen] = useState(false);
  const mounted = useMountOnFirstOpen(open);

  return (
    <>
      <Button
        variant="primary"
        iconLeft={Upload as LucideIcon}
        onClick={() => setOpen(true)}
      >
        Upload Spend
      </Button>
      {mounted && <AdSpendUploadModal open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
