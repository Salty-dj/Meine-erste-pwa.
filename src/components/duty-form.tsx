"use client";
import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { saveDuty } from "@/app/(portal)/dienste/actions";
import type { DutyInput } from "@/lib/duty-input";

export function DutyForm({
  operation,
  label,
  children,
}: {
  operation: DutyInput["operation"];
  label: string;
  children?: ReactNode;
}) {
  const [state, action, pending] = useActionState(saveDuty, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="operation" value={operation} />
      {children}
      {state.error && (
        <p role="alert" className="feedback error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="feedback success">
          {state.success}
        </p>
      )}
      <Button
        type="submit"
        disabled={pending}
        variant="outline"
        className="self-start"
      >
        {pending ? "Wird gespeichert …" : label}
      </Button>
    </form>
  );
}
