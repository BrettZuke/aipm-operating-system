import { SettingsHeader, SettingsCard } from "../_section";
import { Lock, KeyRound, Smartphone } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { ChangePasswordForm, SignOutEverywhereButton } from "./security-forms";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const { user } = await getAuthContext();

  // user.last_sign_in_at + user.created_at + identities are populated by Supabase
  const lastSignIn = user.last_sign_in_at;
  const createdAt = user.created_at;
  const identities = user.identities ?? [];

  return (
    <div className="space-y-6">
      <SettingsHeader title="Security" sub="Manage how you sign in and verify it's you." />

      <SettingsCard title="Password" sub="Change the password on your account.">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.06)]">
              <Lock className="size-4 text-[#9CA3AF]" />
            </div>
            <div className="text-sm text-[#9CA3AF]">{user.email}</div>
          </div>
          <ChangePasswordForm />
        </div>
      </SettingsCard>

      <SettingsCard title="Two-factor authentication" sub="Add a second layer when signing in.">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.06)]">
              <Smartphone className="size-4 text-[#9CA3AF]" />
            </div>
            <div>
              <div className="text-sm font-medium text-[#F5F5F7]">Authenticator app</div>
              <div className="text-xs text-[#6B7280]">Not yet wired — Supabase TOTP enrollment is on the roadmap.</div>
            </div>
          </div>
          <button disabled className="rounded-lg border border-[rgba(255,255,255,0.10)] px-4 py-2 text-sm text-[#6B7280] cursor-not-allowed">Coming soon</button>
        </div>
      </SettingsCard>

      <SettingsCard title="Sign-in history" sub="Recent activity on your account.">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-[#6B7280]">Last signed in</div>
            <div className="mt-1 text-[#F5F5F7]">{lastSignIn ? new Date(lastSignIn).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-[#6B7280]">Account created</div>
            <div className="mt-1 text-[#F5F5F7]">{createdAt ? new Date(createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-[#6B7280]">Sign-in providers</div>
            <div className="mt-1 text-[#F5F5F7] capitalize">{identities.map(i => i.provider).join(", ") || "email"}</div>
          </div>
          <div>
            <div className="text-xs text-[#6B7280]">User ID</div>
            <div className="mt-1 font-mono text-[10px] text-[#9CA3AF]">{user.id}</div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Active sessions" sub="Devices currently signed in. Revokes refresh tokens immediately.">
        <SignOutEverywhereButton />
      </SettingsCard>
    </div>
  );
}
