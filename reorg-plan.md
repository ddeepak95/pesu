# Institution hierarchy and roles — architecture and migration plan

## 1. Goals (original intent)

- **Classes** are scoped under an **institution** (tenant boundary).
- **Super admin** (platform): create institutions, manage institution lifecycle, assign/remove **institution admins**, and edit **super-admin-only** institution settings.
- **Institution admins**: edit **institution-level** settings they are allowed to see, and **fully administer every class** under that institution (create, edit, class settings, same effective powers as “owns all classes in the org” for that institution).
- **Per-institution API keys** so chatbots / LLM flows for classes under that institution use that tenant’s credentials (not only global env keys).
- **Default institution:** users who are **not** members of any “real” institution can still **create classes**; those classes are stored under a platform-wide **default institution** (see §2). **Super admin** can **reassign** classes from the default institution (or between institutions when needed) into a specific institution.

## 2. Locked product decisions

| Decision | Choice |
|----------|--------|
| User ↔ institution | **Many-to-many**: one user may belong to **multiple** institutions (e.g. consultant, multi-campus). |
| Class creation without institution membership | **Allowed.** User does **not** need `institution_members` rows to create a class. New classes get `institution_id` = **default institution** (system-assigned). |
| Default institution | Exactly one logical **default / personal** institution (e.g. `institutions.is_default = true` or a well-known UUID in config). Used for all “unaffiliated” new classes. Not the same as “user is admin of the whole default org.” |
| Moving classes between institutions | **Super admin only** (unless product later delegates). Super admin can attach classes from the default institution to another institution **when required** (onboarding, enterprise adoption, cleanup). Document **audit** (who moved, when, from → to). |
| Institution admin ↔ classes | Institution admins are **full admins of every class** under their institution (not limited to classes they created). |
| Class teachers | Existing **class-level** roles (e.g. owner, co-teacher) can remain for **delegation** inside a class; institution admin is a **superset** for all classes in the institution (must be reflected in RLS and APIs). |

**Implication:** Authorization checks for “can manage this class?” become: **institution admin for class’s institution** OR **existing class owner/co-teacher** (and platform super admin everywhere). **Membership in an institution is not required** to be a class owner under the default institution.

**Default vs formal institutions:** Institution **admins** manage their tenant’s classes and settings. Users with classes only under the default institution behave like today’s “solo teacher” model until a super admin moves their class(es) into a formal institution (and optionally adds them as `institution_members`).

## 3. Conceptual model

```
Platform
  └── Institution (tenant) — includes one special "default" institution
        ├── Institution settings (split: platform-only vs institution-editable)
        ├── Institution API credentials (provider keys, server-side only)
        ├── Institution admins (users with admin role on this institution)
        └── Classes
              ├── Class settings
              ├── Class teachers (optional delegation)
              └── Students, assignments, … (unchanged conceptually)
```

- **Institution** = billing / policy / secrets boundary + admin team (the **default** institution is a real row for FK integrity but holds **personal / unaffiliated** classes until reassigned).
- **Class** = teaching unit; **always** has `institution_id` (never “no institution”—solo creators use the **default** institution).

## 4. Roles (canonical names)

| Role | Scope | Capabilities (summary) |
|------|--------|-------------------------|
| **Super admin** | Platform | CRUD institutions; manage institution admins list; edit super-admin-only settings; suspend institution; **reassign classes** between institutions (including from **default** → target institution); break-glass operations. |
| **Institution admin** | One institution (per membership row) | Edit allowed institution settings; manage all classes under institution; manage class settings; manage class-level invites/teachers as needed by product; **no** access to other institutions unless also a member there. |
| **Class owner / co-teacher** | Single class | Unchanged semantics where they already exist; must **not** grant institution-wide access. |
| **Student** | Class / assignment | Unchanged. |

**Multi-institution user:** same `auth.users` row; multiple rows in `institution_members` (or equivalent) with role `admin` (and optionally future roles like `member` / `viewer` if needed).

## 5. Settings split (super-admin vs institution-admin)

Maintain an explicit **matrix** (add rows as you discover settings during implementation).

| Setting / capability | Super admin | Institution admin | Notes |
|----------------------|-------------|-------------------|-------|
| Create / archive institution | Yes | No | Lifecycle is platform. |
| Add / remove institution admins | Yes | No* | *Unless you later allow “primary admin” delegation—out of scope unless specified. |
| Branding, display name, locale defaults | Yes | Yes | Unless locked by platform. |
| Feature flags / compliance locks | Yes | Read-only or hidden | Typical super-admin-only. |
| API keys (see §6) | Set / rotate / audit | Set / rotate (if product allows) | Never expose full secrets to clients after save. |
| Class CRUD under institution | Yes | Yes | Institution admin = full class admin for all classes. |
| Reassign class to another `institution_id` | Yes | No | Super admin (and audit log). Affects which API keys / policies apply after move. |

**Implementation hint:** either two JSON blobs (`institution_settings`, `institution_platform_overrides`) with documented keys, or typed columns for critical fields—pick one style and stick to it for RLS clarity.

## 6. API keys (chatbots / LLM)

**Requirements**

- Keys are **institution-scoped** (minimum); classes **inherit** unless you explicitly add per-class overrides later.
- **Storage:** encrypted at rest; application or Supabase Vault; **never** return plaintext to the browser after initial save (mask in UI).
- **Usage:** server routes / Edge Functions resolve: `class_id` → `institution_id` → decrypt credentials → call provider. Start with **env fallback** during migration, then make institution key mandatory if desired.

**Operations**

- Audit: who set/changed keys; optional `last_used_at`.
- Rotation: support multiple active keys or clear rotation playbook (single key + downtime vs dual-key).

## 7. Data model (target sketch)

Tables / concepts (names illustrative—align with existing Supabase style):

- **`institutions`**: `id`, `name`, `slug` (optional), `status`, **`is_default` boolean** (at most one `true`, enforced with a partial unique index), timestamps, …
- **`institution_members`**: `institution_id`, `user_id`, `role` (`admin`, …), `created_at`, unique `(institution_id, user_id)`. **Optional** for users who only use the default institution and never join a formal org.
- **`classes`**: add `institution_id` FK → `institutions.id` (nullable only during **legacy** migration window; target state **NOT NULL**, usually pointing at default institution for solo creators).
- **Secrets:** `institution_credentials` or Vault references; provider enum (`openai`, `google`, …); ciphertext + metadata only.

**Indexes:** `classes(institution_id)`, `institution_members(user_id)` for “list my institutions.”

## 8. Authorization and RLS

**Helper functions** (SECURITY DEFINER, STABLE—same pattern as existing class helpers):

- `is_platform_super_admin()` — backed by allowlist table or controlled `app_metadata`, not student-writable fields.
- `is_institution_admin(p_institution_id uuid)` — true if current user has admin membership on that institution.
- Optionally `user_institution_ids()` for listing dashboards.
- `is_default_institution(p_institution_id uuid)` — optional helper for policies that treat the default bucket differently (e.g. hide from “my orgs” switcher).

**Class policies**

- **SELECT/UPDATE** for teachers: existing owner/co-teacher logic **OR** `is_institution_admin(classes.institution_id)` **OR** super admin.
- **INSERT** class:
  - If the user is creating **outside** an explicit institution context (not an institution admin acting for org X): set `institution_id` to the **default institution** (server-enforced; client cannot pick arbitrary institutions).
  - If the user is an **institution admin** for org X (e.g. active org in session): set `institution_id` = X.
  - **Super admin** can insert with any valid `institution_id` per internal tools.
- **UPDATE `institution_id` (move class):** super admin only; consider integrity checks (e.g. moving class into org B should not silently grant B’s keys to previous owners—class owner list unchanged unless product also syncs members).

**Institution tables**

- Members: super admin can manage all; institution admins might read member list if product requires; only super admin adds/removes admins if that remains a platform-only action (per §2 table).

**Students:** unchanged paths; ensure joins never leak cross-institution data (prefer denormalized `institution_id` on hot tables only if RLS becomes too heavy—measure first).

## 9. Migration strategy (phased)

### Phase A — Additive schema (no behavior change)

- Create `institutions`, `institution_members`, optional settings tables.
- Add `classes.institution_id` **nullable** + FK + index.
- Deploy migrations; existing app continues to work without institution context.

**Definition of done:** migrations apply cleanly; no RLS regression on existing flows.

### Phase B — Backfill and default tenant

- Create exactly one **default institution** (`is_default = true`, name e.g. “Personal / Default”) used for all legacy and solo-unaffiliated classes.
- Optionally retain a separate **“Legacy”** bucket only if you need a one-time split from default—otherwise a **single** default institution is simpler.
- Backfill `classes.institution_id` for all rows (nulls → default institution id).
- Script + verification: `SELECT count(*) FROM classes WHERE institution_id IS NULL` = 0 before enforcing NOT NULL.

**Definition of done:** every class has an institution; default row exists and is unique; data report signed off.

### Phase C — Dual-read / dual-write in application

- UI: institution switcher for users who **are** institution admins of at least one non-default org; solo users may see **no** switcher and only “My classes” (all under default `institution_id` until moved).
- APIs: **create class** — if user has no institution admin context, assign **default** `institution_id`; if user is institution admin with active org, assign that org’s id. **Do not** require `institution_members` for solo creation.
- Super-admin tool: **move class** (update `institution_id`) with mandatory audit payload.
- AI routes: resolve credentials `institution → env fallback`.

**Definition of done:** new classes always have a valid `institution_id` (default or chosen org); smoke tests for solo creator and org admin; smoke tests pass.

### Phase D — RLS and admin surfaces

- Extend RLS using helpers in §8.
- Super-admin UI (internal): institutions, members, platform-only settings.
- Institution admin UI: settings, classes, keys (masked).

**Definition of done:** institution admin cannot access another institution’s classes; super admin can.

### Phase E — Hardening

- Set `classes.institution_id` **NOT NULL** (after code no longer inserts nulls).
- Remove env fallback for production if policy requires strict tenant keys.
- Remove temporary compatibility branches.

**Definition of done:** schema matches target; security review on key handling; class-move API reviewed for side effects (keys, RLS, reporting).

## 10. Application / UX notes

- **Context:** “Current institution” should be explicit in session or URL segment for **institution admins** creating classes **for that org** (especially for multi-institution users). Solo teachers never need to pick an institution.
- **Default institution:** usually **hidden** from end-user org pickers; users are not auto-added as `institution_members` of the default org solely because they have a class there—unless you explicitly want a “everyone is member of default” model (not required for this plan).
- **Navigation:** list institutions the user admins (non-default); deep links can stay class-centric (`/class/[id]`) since `institution_id` is a data concern first.
- **After super admin moves a class:** class owners keep access via existing class roles; they may need **in-app notice** that the class now falls under org policies and API keys of the target institution.

## 11. Testing matrix (minimum)

For each role × action: expect allow/deny.

| Action | Super admin | Inst. admin (tenant A) | Inst. admin (tenant B) | Class owner | Student |
|--------|-------------|-------------------------|-------------------------|-------------|---------|
| Edit institution A settings (allowed keys) | Yes | Yes | No | N/A | No |
| Manage all classes in A | Yes | Yes | No | Only own class | No |
| Move class from default / A → B | Yes | No | No | No | No |
| Create class while not in any `institution_members` | N/A (use tools) | N/A | N/A | Yes (→ default institution) | No |
| Use resolved API key for class in A | Via system | Via system | — | — | — |

Add regression tests for **two institutions**, same user as admin of both: actions scoped to active institution only. Add tests: **solo user** creates class → `institution_id` = default; **super admin** moves class → `institution_id` updates and institution B admin gains manage rights per RLS.

## 12. Rollback and risk

- **Rollback:** Phase A–B are rollback-friendly (nullable FK, extra tables). After NOT NULL and RLS tightening, rollback requires DB restore or forward-fix—avoid rushing Phase E.
- **Risks:** cross-tenant key mix-up (mitigate with tests + explicit `institution_id` on resolve path); RLS complexity (mitigate with helpers + denormalization only where proven necessary).

## 13. Checklist before starting implementation

- [ ] Create **default institution** seed + migration guard (single `is_default`).
- [ ] Choose backfill strategy for existing rows (typically: all existing classes → default institution, then super admin moves batches into real orgs as needed).
- [ ] Finalize super-admin-only setting list with stakeholders.
- [ ] Confirm secret storage (Vault vs app-encrypted column); decide whether **default** institution uses only env keys or shared platform key policy.
- [ ] Confirm whether institution admins may add other institution admins (currently **no** per §5—adjust if product changes).
- [ ] Specify **class move** side effects: notifications, whether `created_by` changes, analytics continuity, storage paths if org-scoped.
- [ ] List all tables/policies that reference `classes` without `institution_id` for RLS updates.

## 14. Open items (fill during implementation)

- Co-teacher vs institution admin: can institution admin **remove** class owners? (Product decision; document here when decided.)
- Billing / limits per institution (if applicable).
- SSO / domain restriction per institution (future).

---

*This document is the single source of truth for migration sequencing and role semantics; update it when decisions change.*
