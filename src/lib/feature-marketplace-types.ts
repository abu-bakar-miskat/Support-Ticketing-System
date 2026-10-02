import type { MarketplaceFeatureKey } from "@/lib/template-features";

export type MarketplaceFeatureStatus = "enabled" | "pending" | "available";

export type MarketplaceFeature = {
  key: MarketplaceFeatureKey;
  label: string;
  description: string;
  status: MarketplaceFeatureStatus;
  group: string;
};

export type MarketplaceTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  features: { key: string; label: string; status: MarketplaceFeatureStatus }[];
  status: MarketplaceFeatureStatus;
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
