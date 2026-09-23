import React, { useState } from "react";
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

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!email.trim()) {
      setError("Podaj adres e-mail");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Podaj poprawny adres e-mail");
    } else {
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

      <SubmitButton pendingText="Wysyłanie…" icon={<Send className="size-4" />}>
        Wyślij link do logowania
      </SubmitButton>
    </form>
  );
}
