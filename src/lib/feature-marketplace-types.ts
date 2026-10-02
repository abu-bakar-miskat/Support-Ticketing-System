import type { MarketplaceFeatureKey } from "@/lib/template-features";

export type MarketplaceFeatureStatus = "enabled" | "pending" | "available";

export type MarketplaceFeature = {
  key: MarketplaceFeatureKey;
  label: string;
  description: string;
  status: MarketplaceFeatureStatus;
  group: string;
};

export type MarketplaceDepartment = {
  id: string;
  name: string;
};

export type MarketplaceTemplateFeature = {
  key: string;
  label: string;
  status: MarketplaceFeatureStatus;
  /** Departments that already have this feature. */
  enabledFor: string[];
  /** Departments with a pending request for this feature. */
  pendingFor: string[];
};

export type MarketplaceBoard = {
  useCase: string;
  group: string;
  statuses: { label: string; color: string; isComplete: boolean }[];
  lists: { name: string; statuses: string[] }[];
  featureDetails: { key: string; explanation: string; summary: string | null }[];
};

export type MarketplaceTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  features: MarketplaceTemplateFeature[];
  status: MarketplaceFeatureStatus;
  /** Departments with a pending request for the whole operation. */
  pendingFor: string[];
  /** Statuses and lists for this board, including a super-admin save. */
  board: MarketplaceBoard | null;
};

export type PendingFeatureRequest = {
  id: string;
  featureKey: string;
  /** The template's feature keys (or the single requested key), for the preview graphic. */
  featureKeys: string[];
  featureLabel: string;
  featureDescription: string | null;
  message: string | null;
  requestedAt: string;
  tenant: { id: string; name: string };
  department: { id: string; name: string };
  requester: { id: string; name: string; email: string } | null;
};
