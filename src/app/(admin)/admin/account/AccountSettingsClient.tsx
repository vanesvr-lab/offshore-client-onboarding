// B-101 Batch 4 — admin account settings client component.
//
// Three stacked cards:
//   1. Profile picture (upload / remove)
//   2. Profile details (name; email read-only)
//   3. Change password (current + new + confirm)
//
// Each card owns its own dirty/in-flight state. Avatar mutations refresh
// the page (router.refresh) so the sidebar footer picks up the new URL.

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BTN_PRIMARY =
  "bg-brand-navy hover:bg-brand-blue text-white rounded-full border-transparent";
const BTN_OUTLINE =
  "bg-white hover:bg-gray-50 text-brand-navy hover:text-brand-navy border-brand-navy rounded-full";

interface InitialUser {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
}

export function AccountSettingsClient({ initialUser }: { initialUser: InitialUser }) {
  const router = useRouter();
  const [user, setUser] = useState<InitialUser>(initialUser);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile details
  const [fullName, setFullName] = useState(initialUser.full_name);
  const [savingName, setSavingName] = useState(false);
  const nameDirty = fullName.trim() !== initialUser.full_name.trim() && fullName.trim().length > 0;

  // Password
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const passwordsFilled = currentPwd && newPwd && confirmPwd;
  const passwordsMatch = newPwd === confirmPwd;
  const canSubmitPassword = !!passwordsFilled && newPwd.length >= 8 && passwordsMatch;

  async function handleFileChosen(file: File) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Use PNG, JPEG, or WebP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File exceeds 2 MB.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/account/avatar", { method: "POST", body: fd });
      const payload = (await res.json().catch(() => ({}))) as { avatar_url?: string; error?: string };
      if (!res.ok) {
        toast.error(payload.error ?? "Upload failed");
        return;
      }
      setUser((u) => ({ ...u, avatar_url: payload.avatar_url ?? u.avatar_url }));
      toast.success("Profile picture updated");
      router.refresh();
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveAvatar() {
    setRemoving(true);
    try {
      const res = await fetch("/api/admin/account/avatar", { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(payload.error ?? "Remove failed");
        return;
      }
      setUser((u) => ({ ...u, avatar_url: null }));
      toast.success("Profile picture removed");
      router.refresh();
    } catch {
      toast.error("Remove failed");
    } finally {
      setRemoving(false);
    }
  }

  async function handleSaveName() {
    setSavingName(true);
    try {
      const res = await fetch("/api/admin/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName.trim() }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        data?: { full_name: string };
        error?: string;
      };
      if (!res.ok) {
        toast.error(payload.error ?? "Save failed");
        return;
      }
      setUser((u) => ({ ...u, full_name: payload.data?.full_name ?? fullName.trim() }));
      toast.success("Name updated");
      router.refresh();
    } catch {
      toast.error("Save failed");
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError(null);
    if (!canSubmitPassword) return;
    setChangingPwd(true);
    try {
      const res = await fetch("/api/admin/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPwd,
          new_password: newPwd,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setPwdError(payload.error ?? "Could not change password");
        return;
      }
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      toast.success("Password changed");
    } catch {
      setPwdError("Could not change password");
    } finally {
      setChangingPwd(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Profile picture */}
      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-base font-semibold text-brand-navy mb-4">Profile picture</h2>
        <div className="flex items-center gap-6">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-gray-100 flex items-center justify-center">
            {user.avatar_url ? (
              <Image
                src={user.avatar_url}
                alt="Avatar"
                width={96}
                height={96}
                className="h-24 w-24 object-cover"
                unoptimized
              />
            ) : (
              <UserCircle className="h-16 w-16 text-gray-400" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileChosen(file);
              }}
            />
            <Button
              variant="outline"
              className={`gap-2 ${BTN_OUTLINE}`}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload new picture
            </Button>
            {user.avatar_url && (
              <button
                type="button"
                onClick={() => void handleRemoveAvatar()}
                disabled={removing}
                className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Remove picture
              </button>
            )}
            <p className="text-xs text-gray-500">PNG, JPEG, or WebP. Max 2 MB.</p>
          </div>
        </div>
      </section>

      {/* Profile details */}
      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-base font-semibold text-brand-navy mb-4">Profile details</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={200}
              disabled={savingName}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <Input value={user.email} disabled className="bg-gray-50 text-gray-500" />
            <p className="text-xs text-gray-500 mt-1">Email changes are not available in this release.</p>
          </div>
          <div className="flex justify-end">
            <Button
              className={BTN_PRIMARY}
              onClick={() => void handleSaveName()}
              disabled={!nameDirty || savingName}
            >
              {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </div>
      </section>

      {/* Change password */}
      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-base font-semibold text-brand-navy mb-4">Change password</h2>
        <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
            <Input
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              autoComplete="current-password"
              disabled={changingPwd}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
            <Input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              autoComplete="new-password"
              disabled={changingPwd}
            />
            <p className="text-xs text-gray-500 mt-1">Minimum 8 characters.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
            <Input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              autoComplete="new-password"
              disabled={changingPwd}
            />
            {confirmPwd && !passwordsMatch && (
              <p className="text-xs text-red-600 mt-1">Passwords don&rsquo;t match.</p>
            )}
          </div>
          {pwdError && (
            <p className="text-sm text-red-600">{pwdError}</p>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              className={BTN_PRIMARY}
              disabled={!canSubmitPassword || changingPwd}
            >
              {changingPwd ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Change password
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
