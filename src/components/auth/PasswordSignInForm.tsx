import React, { useEffect, useRef, useState } from "react";
import { Lock, LogIn, Mail } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  serverError?: string | null;
}

export default function PasswordSignInForm({ serverError }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  // Native POST: track submitting ourselves (useFormStatus doesn't see it), as in MagicLinkForm.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) {
      setError("Podaj adres e-mail i hasło");
      e.preventDefault();
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
  }

  return (
    <form method="POST" action="/api/auth/signin" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="password-email"
        name="email"
        type="email"
        label="Adres e-mail"
        value={email}
        onChange={(v) => {
          setEmail(v);
          setError(undefined);
        }}
        placeholder="ty@example.com"
        icon={<Mail className="size-4" />}
      />
      <FormField
        id="password"
        type="password"
        label="Hasło"
        value={password}
        onChange={(v) => {
          setPassword(v);
          setError(undefined);
        }}
        error={error}
        icon={<Lock className="size-4" />}
      />

      <ServerError message={serverError} />

      <SubmitButton pending={submitting} pendingText="Logowanie…" icon={<LogIn className="size-4" />}>
        Zaloguj się hasłem
      </SubmitButton>
    </form>
  );
}
