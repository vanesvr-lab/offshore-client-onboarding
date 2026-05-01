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
import { isEmail, isRequired } from "@/lib/validation";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function validateEmail(): boolean {
    const required = isRequired(email, "Email");
    if (!required.valid) {
      setEmailError(required.message);
      return false;
    }
    const valid = isEmail(email);
    if (!valid.valid) {
      setEmailError(valid.message);
      return false;
    }
    setEmailError(null);
    return true;
  }

  function validatePassword(): boolean {
    const required = isRequired(password, "Password");
    if (!required.valid) {
      setPasswordError(required.message);
      return false;
    }
    setPasswordError(null);
    return true;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const okEmail = validateEmail();
    const okPassword = validatePassword();
    if (!okEmail || !okPassword) return;

    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error("Invalid email or password");
        return;
      }

      // Let middleware handle the redirect based on role
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-brand-navy">Mauritius Offshore Client Portal</h1>
        <p className="text-sm text-gray-600 mt-1">The intelligent portal for client due diligence and compliance</p>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to your account</CardTitle>
          <CardDescription>Enter your credentials to access the portal</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6" noValidate>
            <FormField label="Email" required error={emailError}>
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError(null);
                  }}
                  onBlur={validateEmail}
                  placeholder="you@example.com"
                  className="h-11"
                />
              )}
            </FormField>

            <FormField label="Password" required error={passwordError}>
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  onBlur={validatePassword}
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
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-gray-600">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-brand-navy font-medium underline-offset-4 hover:underline">
              Register
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
