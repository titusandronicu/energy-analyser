import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DisclosureButtonProps {
  openLabel: string;
  closeLabel: string;
  controlsId: string;
  // Motion is opt-in: the chevron turn and the content fade only run when true, so the chevron still follows
  // `aria-expanded` instantly otherwise.
  animate?: boolean;
  children: ReactNode;
}

// The one native <details> the design brief asks to become a controlled disclosure (Pokaż
// szczegóły / Ukryj szczegóły) — every other card's own contextual disclosure stays native.
export function DisclosureButton({
  openLabel,
  closeLabel,
  controlsId,
  animate = false,
  children,
}: DisclosureButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="group border-primary/45 text-primary hover:bg-primary/10 hover:text-primary h-11 rounded-xl bg-transparent px-[18px] font-semibold"
        aria-expanded={open}
        aria-controls={controlsId}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        {open ? closeLabel : openLabel}
        <ChevronDown
          className={cn(
            "size-4 group-aria-expanded:rotate-180",
            animate && "motion-safe:transition-transform motion-safe:duration-200",
          )}
          aria-hidden="true"
        />
      </Button>
      <div id={controlsId} hidden={!open} className={cn(animate && open && "animate-disclose")}>
        {children}
      </div>
    </>
  );
}
