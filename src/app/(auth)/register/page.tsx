"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isEmail, isMinLength, isRequired } from "@/lib/validation";
import { toast } from "sonner";

interface FormState {
  fullName: string;
  email: string;
  password: string;
  companyName: string;
}
type FieldKey = keyof FormState;

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>({
    fullName: "",
    email: "",
    password: "",
    companyName: "",
  });
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});

  function update(field: FieldKey) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      if (errors[field]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }
    };
  }

  function setError(field: FieldKey, message: string | null) {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
  }

  function validateField(field: FieldKey): boolean {
    const value = form[field];
    if (field === "fullName") {
      const required = isRequired(value, "Full name");
      if (!required.valid) {
        setError(field, required.message);
        return false;
      }
    }
    if (field === "companyName") {
      const required = isRequired(value, "Company name");
      if (!required.valid) {
        setError(field, required.message);
        return false;
      }
    }
    if (field === "email") {
      const required = isRequired(value, "Email");
      if (!required.valid) {
        setError(field, required.message);
        return false;
      }
      const valid = isEmail(value);
      if (!valid.valid) {
        setError(field, valid.message);
        return false;
      }
    }
    if (field === "password") {
      const required = isRequired(value, "Password");
      if (!required.valid) {
        setError(field, required.message);
        return false;
      }
      const long = isMinLength(value, 8, "Password");
      if (!long.valid) {
        setError(field, long.message);
        return false;
      }
    }
    setError(field, null);
    return true;
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const fields: FieldKey[] = ["fullName", "companyName", "email", "password"];
    const results = fields.map(validateField);
    if (results.some((r) => !r)) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      // Auto sign in after registration
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (result?.error) throw new Error("Account created but sign-in failed");

      toast.success("Account created!");
      router.push("/apply");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-brand-navy">Mauritius Offshore Client Portal</h1>
        <p className="text-sm text-gray-600 mt-1">The intelligent portal for client due diligence and compliance</p>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Start your onboarding application</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-6" noValidate>
            <FormField label="Full name" required error={errors.fullName ?? null}>
              {(props) => (
                <Input
                  {...props}
                  value={form.fullName}
                  onChange={update("fullName")}
                  onBlur={() => validateField("fullName")}
                  autoComplete="name"
                  className="h-11"
                />
              )}
            </FormField>

            <FormField label="Company name" required error={errors.companyName ?? null}>
              {(props) => (
                <Input
                  {...props}
                  value={form.companyName}
                  onChange={update("companyName")}
                  onBlur={() => validateField("companyName")}
                  autoComplete="organization"
                  className="h-11"
                />
              )}
            </FormField>

            <FormField label="Email" required error={errors.email ?? null}>
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={update("email")}
                  onBlur={() => validateField("email")}
                  placeholder="you@example.com"
                  className="h-11"
                />
              )}
            </FormField>

            <FormField
              label="Password"
              required
              helperText="At least 8 characters."
              error={errors.password ?? null}
            >
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  value={form.password}
                  onChange={update("password")}
                  onBlur={() => validateField("password")}
                  autoComplete="new-password"
                  minLength={8}
                  className="h-11"
                />
              )}
            </FormField>

            <Button
              type="submit"
              className="w-full h-11 bg-brand-navy text-white font-semibold hover:bg-brand-navy/90"
              disabled={loading}
              aria-busy={loading || undefined}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/login" className="text-brand-navy font-medium underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
