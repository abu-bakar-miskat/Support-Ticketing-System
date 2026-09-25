/**
 * The tenant service-agreement policy shown to a Super Admin at tenant creation
 * (they must read and accept it before the tenant can be created). Kept here as
 * a single source of truth so the copy can be reviewed/updated in one place and
 * later moved behind a platform setting if it needs to be admin-editable.
 *
 * Plain data (no JSX) so it can be imported by both server and client code.
 */

export type AgreementPolicySection = {
  heading: string;
  body: string;
};

export const AGREEMENT_POLICY_VERSION = "1.0";

export const AGREEMENT_POLICY_TITLE = "Tenant Service Agreement";

export const AGREEMENT_POLICY_INTRO =
  "By creating this tenant you confirm, on behalf of the organization, that you have read and agree to the terms below. A tenant is only operational while a valid agreement covers the current date; access is restricted when the agreement is missing, expired, or otherwise invalid.";

export const AGREEMENT_POLICY_SECTIONS: AgreementPolicySection[] = [
  {
    heading: "1. Term & validity",
    body: "The tenant is provisioned for the agreement period defined by the start and end dates recorded at creation. Operations are automatically enabled for the duration of a valid term and are restored automatically when the agreement is renewed.",
  },
  {
    heading: "2. Access & suspension",
    body: "When no valid agreement is in effect, all tenant operations are blocked for its members. Every attempt to access a tenant without a valid agreement is logged and the platform's Super Admins are notified with the tenant, the user, and the time of the attempt.",
  },
  {
    heading: "3. Renewal",
    body: "The organization is responsible for renewing the agreement before its end date. Renewal reminders are sent to Super Admins ahead of expiry. Recording a new or renewed agreement term immediately reinstates access.",
  },
  {
    heading: "4. Acceptable use",
    body: "The tenant and its members will use the platform lawfully and will not attempt to access data belonging to other tenants. Each tenant's data is isolated and remains the property of that organization.",
  },
  {
    heading: "5. Data & privacy",
    body: "Tenant data is retained for the lifetime of the tenant and is never shared across tenants. Suspending or removing a tenant restricts access without destroying its data.",
  },
];
