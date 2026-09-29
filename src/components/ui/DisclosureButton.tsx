import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface DisclosureButtonProps {
  openLabel: string;
  closeLabel: string;
  controlsId: string;
  children: ReactNode;
}

// The one native <details> the design brief asks to become a controlled disclosure (Pokaż
// szczegóły / Ukryj szczegóły) — every other card's own contextual disclosure stays native.
export function DisclosureButton({ openLabel, closeLabel, controlsId, children }: DisclosureButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        aria-expanded={open}
        aria-controls={controlsId}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        {open ? closeLabel : openLabel}
      </Button>
      <div id={controlsId} hidden={!open}>
        {children}
      </div>
    </>
  );
}
