import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The button looks the owner's forms share (the alert rules and the day note): a <summary> that opens a form, the
// submit button, and the delete button. Plain class strings, so the Astro panels use them with `class:list`.
export const SUMMARY_CLASS = cn(
  buttonVariants({ variant: "outline" }),
  "border-border-strong h-11 cursor-pointer list-none rounded-xl bg-transparent px-4 [&::-webkit-details-marker]:hidden",
);
export const SUBMIT_CLASS = cn(buttonVariants(), "h-11 rounded-xl px-4");
export const DELETE_CLASS = cn(buttonVariants({ variant: "destructive" }), "h-11 rounded-xl px-4");
