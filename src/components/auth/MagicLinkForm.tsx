import React, { useEffect, useRef, useState } from "react";
import { Mail, Send } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  serverError?: string | null;
}

export default function MagicLinkForm({ serverError }: Props) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  // A native POST is invisible to useFormStatus, so track it here: a second
  // submit would send a second email and burn the Supabase mailer limit.
  // The ref also blocks a second submit fired before React re-renders.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Re-enable the form when the page is restored from the back/forward cache.
  useEffect(() => {
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (submittingRef.current) {
      e.preventDefault();
      return;
    }
    if (!email.trim()) {
      setError("Podaj adres e-mail");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Podaj poprawny adres e-mail");
    } else {
      submittingRef.current = true;
      setSubmitting(true);
      return;
    }
    e.preventDefault();
  }

  return (
    <form method="POST" action="/api/auth/magic-link" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="email"
        type="email"
        label="Adres e-mail"
        value={email}
        onChange={(v) => {
          setEmail(v);
          setError(undefined);
        }}
        placeholder="ty@example.com"
        error={error}
        icon={<Mail className="size-4" />}
      />

      <ServerError message={serverError} />

      <SubmitButton pending={submitting} pendingText="Wysyłanie…" icon={<Send className="size-4" />}>
        Wyślij link do logowania
      </SubmitButton>
    </form>
  );
}
