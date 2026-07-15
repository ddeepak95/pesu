import type { Institution } from "@/lib/queries/institutions";
import type { AiCreditWallet, WalletKeyOwner } from "@/lib/queries/aiCreditWallets";
import {
  allocateCreditsAction,
  createWalletAction,
  setDefaultClassWalletCreditsAction,
  setSelfManageEnabledAction,
  updateWalletPolicyAction,
} from "@/app/admin/institutions/[id]/wallets/actions";

interface ClassOption {
  id: string;
  name: string;
}

export interface WalletsManagementViewProps {
  institution: Institution;
  basePath: "admin" | "platform";
  viewerRole: "super_admin" | "institution_admin";
  wallets: AiCreditWallet[];
  classes: ClassOption[];
  /** Default grant applied to a newly created class's auto-provisioned wallet — null = unbounded. */
  defaultClassWalletCredits: number | null;
  notice: { ok?: string; error?: string };
}

function DefaultClassWalletCreditsForm({
  institutionId,
  basePath,
  defaultClassWalletCredits,
}: {
  institutionId: string;
  basePath: "admin" | "platform";
  defaultClassWalletCredits: number | null;
}) {
  return (
    <form
      action={setDefaultClassWalletCreditsAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="basePath" value={basePath} />
      <div className="text-sm">
        <p className="font-medium">Default new class wallet</p>
        <p className="mt-1 text-muted-foreground">
          Credits a newly created class starts with. Leave blank for unbounded
          (new classes are created unmetered).
        </p>
      </div>
      <label className="text-sm">
        <span className="block text-muted-foreground">Credits</span>
        <input
          type="number"
          name="defaultClassWalletCredits"
          step="any"
          min="0"
          defaultValue={defaultClassWalletCredits ?? ""}
          placeholder="Unbounded"
          className="mt-1 w-32 rounded border bg-background px-2 py-1"
        />
      </label>
      <button type="submit" className="rounded border px-3 py-1 text-sm">
        Save
      </button>
    </form>
  );
}

const KEY_OWNER_LABELS: Record<WalletKeyOwner, string> = {
  platform: "Platform-funded",
  byok: "BYOK (institution's own key)",
};

function formatCredits(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function PolicyForm({
  wallet,
  institutionId,
  basePath,
  disabled,
}: {
  wallet: AiCreditWallet;
  institutionId: string;
  basePath: "admin" | "platform";
  disabled: boolean;
}) {
  return (
    <form action={updateWalletPolicyAction} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="walletId" value={wallet.id} />
      <input type="hidden" name="basePath" value={basePath} />

      <label className="text-sm">
        <span className="block text-muted-foreground">Enforcement</span>
        <select
          name="enforcement"
          defaultValue={wallet.enforcement}
          disabled={disabled}
          className="mt-1 w-full rounded border bg-background px-2 py-1"
        >
          <option value="off">Off (unmetered)</option>
          <option value="warn">Warn</option>
          <option value="block">Block</option>
        </select>
      </label>

      <label className="text-sm">
        <span className="block text-muted-foreground">Max balance (rollover cap)</span>
        <input
          type="number"
          name="maxBalance"
          step="any"
          defaultValue={wallet.max_balance ?? ""}
          disabled={disabled}
          placeholder="Unbounded"
          className="mt-1 w-full rounded border bg-background px-2 py-1"
        />
      </label>

      <label className="text-sm">
        <span className="block text-muted-foreground">Warn threshold</span>
        <input
          type="number"
          name="softWarnThreshold"
          step="any"
          defaultValue={wallet.soft_warn_threshold ?? ""}
          disabled={disabled}
          placeholder="None"
          className="mt-1 w-full rounded border bg-background px-2 py-1"
        />
      </label>

      {wallet.class_id === null ? (
        <label className="text-sm">
          <span className="block text-muted-foreground">Class allocation capacity</span>
          <input
            type="number"
            name="classAllocationCapacity"
            step="any"
            defaultValue={wallet.class_allocation_capacity ?? ""}
            disabled={disabled}
            placeholder="Unbounded"
            className="mt-1 w-full rounded border bg-background px-2 py-1"
          />
        </label>
      ) : (
        <input type="hidden" name="classAllocationCapacity" value="" />
      )}

      <div className="col-span-2 sm:col-span-4">
        <button
          type="submit"
          disabled={disabled}
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
        >
          Save policy
        </button>
      </div>
    </form>
  );
}

function AllocateForm({
  wallet,
  institutionId,
  basePath,
  disabled,
}: {
  wallet: AiCreditWallet;
  institutionId: string;
  basePath: "admin" | "platform";
  disabled: boolean;
}) {
  return (
    <form action={allocateCreditsAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="walletId" value={wallet.id} />
      <input type="hidden" name="basePath" value={basePath} />

      <label className="text-sm">
        <span className="block text-muted-foreground">Add credits</span>
        <input
          type="number"
          name="credits"
          step="any"
          min="0"
          required
          disabled={disabled}
          className="mt-1 w-32 rounded border bg-background px-2 py-1"
        />
      </label>
      <label className="text-sm">
        <span className="block text-muted-foreground">Note</span>
        <input
          name="note"
          disabled={disabled}
          className="mt-1 w-48 rounded border bg-background px-2 py-1"
        />
      </label>
      <button
        type="submit"
        disabled={disabled}
        className="rounded border px-3 py-1 text-sm disabled:opacity-50"
      >
        Allocate
      </button>
    </form>
  );
}

function CreateWalletForm({
  institutionId,
  basePath,
  classId,
  keyOwner,
  label,
}: {
  institutionId: string;
  basePath: "admin" | "platform";
  classId: string | null;
  keyOwner: WalletKeyOwner;
  label: string;
}) {
  return (
    <form action={createWalletAction}>
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="basePath" value={basePath} />
      <input type="hidden" name="classId" value={classId ?? ""} />
      <input type="hidden" name="keyOwner" value={keyOwner} />
      <button type="submit" className="rounded border px-3 py-1 text-sm">
        {label}
      </button>
    </form>
  );
}

function WalletCard({
  wallet,
  institution,
  basePath,
  viewerRole,
}: {
  wallet: AiCreditWallet;
  institution: Institution;
  basePath: "admin" | "platform";
  viewerRole: "super_admin" | "institution_admin";
}) {
  // Mirrors the RLS/trigger authority (D9): an institution admin can edit a
  // class wallet, or their own institution's BYOK wallet once self-service is
  // on — everything else is super-admin-only. The UI reflects this so the
  // "Save" click doesn't just bounce off RLS, but Postgres remains the actual
  // authority either way.
  const isSuper = viewerRole === "super_admin";
  const canEditPolicy =
    isSuper ||
    wallet.class_id !== null ||
    (wallet.key_owner === "byok" && wallet.self_manage_enabled);

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium">{KEY_OWNER_LABELS[wallet.key_owner]}</span>
          <span className="ml-2 text-sm text-muted-foreground">
            Balance: {formatCredits(wallet.balance)} credits
          </span>
        </div>
        {wallet.key_owner === "byok" && wallet.class_id === null && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              Self-service: {wallet.self_manage_enabled ? "enabled" : "disabled"}
            </span>
            {isSuper && (
              <form action={setSelfManageEnabledAction}>
                <input type="hidden" name="institutionId" value={institution.id} />
                <input type="hidden" name="walletId" value={wallet.id} />
                <input type="hidden" name="basePath" value={basePath} />
                <input
                  type="hidden"
                  name="selfManageEnabled"
                  value={(!wallet.self_manage_enabled).toString()}
                />
                <button type="submit" className="rounded border px-2 py-0.5">
                  {wallet.self_manage_enabled ? "Disable" : "Enable"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      <PolicyForm
        wallet={wallet}
        institutionId={institution.id}
        basePath={basePath}
        disabled={!canEditPolicy}
      />
      <AllocateForm
        wallet={wallet}
        institutionId={institution.id}
        basePath={basePath}
        disabled={!canEditPolicy}
      />
    </div>
  );
}

export default function WalletsManagementView({
  institution,
  basePath,
  viewerRole,
  wallets,
  classes,
  defaultClassWalletCredits,
  notice,
}: WalletsManagementViewProps) {
  const institutionWallets = wallets.filter((w) => w.class_id === null);
  const classWallets = wallets.filter((w) => w.class_id !== null);
  const classById = new Map(classes.map((c) => [c.id, c]));

  const missingInstitutionKeyOwners = (["platform", "byok"] as const).filter(
    (ko) => !institutionWallets.some((w) => w.key_owner === ko),
  );

  return (
    <div className="space-y-8">
      {notice.ok && (
        <div className="rounded border border-green-600/40 bg-green-600/10 px-3 py-2 text-sm text-green-700">
          {notice.ok}
        </div>
      )}
      {notice.error && (
        <div className="rounded border border-red-600/40 bg-red-600/10 px-3 py-2 text-sm text-red-700">
          {notice.error}
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Institution wallets</h2>
        <p className="text-sm text-muted-foreground">
          The institution-level wallet funds every class that doesn&apos;t have its
          own wallet for that key. Set a class allocation capacity to bound how
          much can be handed out to classes in total.
        </p>
        {institutionWallets.map((w) => (
          <WalletCard
            key={w.id}
            wallet={w}
            institution={institution}
            basePath={basePath}
            viewerRole={viewerRole}
          />
        ))}
        {missingInstitutionKeyOwners.map((ko) => (
          <div key={ko} className="rounded-lg border border-dashed p-4">
            <p className="mb-2 text-sm text-muted-foreground">
              No {KEY_OWNER_LABELS[ko]} wallet yet for this institution — unmetered
              until one exists.
            </p>
            <CreateWalletForm
              institutionId={institution.id}
              basePath={basePath}
              classId={null}
              keyOwner={ko}
              label={`Create ${KEY_OWNER_LABELS[ko]} wallet`}
            />
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Class wallets</h2>
        <p className="text-sm text-muted-foreground">
          Every new class automatically gets its own platform wallet, seeded
          per the default below. A class without its own wallet (e.g. created
          before this setting existed) falls back to the institution wallet
          above for that key.
        </p>

        <DefaultClassWalletCreditsForm
          institutionId={institution.id}
          basePath={basePath}
          defaultClassWalletCredits={defaultClassWalletCredits}
        />

        {classWallets.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No class-specific wallets yet.
          </p>
        )}
        {classWallets.map((w) => {
          const cls = w.class_id ? classById.get(w.class_id) : undefined;
          return (
            <details key={w.id} className="rounded-lg border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                {cls?.name ?? w.class_id} — {KEY_OWNER_LABELS[w.key_owner]} —{" "}
                {formatCredits(w.balance)} credits — {w.enforcement}
              </summary>
              <div className="border-t p-4">
                <WalletCard
                  wallet={w}
                  institution={institution}
                  basePath={basePath}
                  viewerRole={viewerRole}
                />
              </div>
            </details>
          );
        })}

        <details className="rounded-lg border border-dashed">
          <summary className="cursor-pointer px-4 py-3 text-sm text-muted-foreground">
            Create a class wallet
          </summary>
          <form action={createWalletAction} className="flex flex-wrap items-end gap-3 p-4">
            <input type="hidden" name="institutionId" value={institution.id} />
            <input type="hidden" name="basePath" value={basePath} />
            <label className="text-sm">
              <span className="block text-muted-foreground">Class</span>
              <select name="classId" required className="mt-1 rounded border bg-background px-2 py-1">
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-muted-foreground">Key</span>
              <select name="keyOwner" className="mt-1 rounded border bg-background px-2 py-1">
                <option value="platform">Platform-funded</option>
                <option value="byok">BYOK</option>
              </select>
            </label>
            <button type="submit" className="rounded border px-3 py-1 text-sm">
              Create wallet
            </button>
          </form>
        </details>
      </section>
    </div>
  );
}
