import { SettingsHeader, SettingsCard } from "../_section";
import { CreditCard, Receipt } from "lucide-react";

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <SettingsHeader title="Billing" sub="Payment methods, invoices, and billing history." />

      <SettingsCard title="Payment method" sub="Used for plan upgrades and add-on purchases.">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.06)]">
              <CreditCard className="size-4 text-[#9CA3AF]" />
            </div>
            <div>
              <div className="text-sm font-medium text-[#F5F5F7]">No payment method</div>
              <div className="text-xs text-[#6B7280]">Add a card to upgrade.</div>
            </div>
          </div>
          <button className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">Add card</button>
        </div>
      </SettingsCard>

      <SettingsCard title="Billing email" sub="Where invoices are sent.">
        <div className="text-sm text-[#9CA3AF]">No billing email on file.</div>
      </SettingsCard>

      <SettingsCard title="Invoices" sub="Download your billing history.">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] mb-3">
            <Receipt className="size-5 text-[#6B7280]" />
          </div>
          <div className="text-sm text-[#9CA3AF]">No invoices yet</div>
          <div className="mt-1 max-w-xs text-xs text-[#6B7280]">Once you upgrade, your invoices appear here.</div>
        </div>
      </SettingsCard>
    </div>
  );
}
