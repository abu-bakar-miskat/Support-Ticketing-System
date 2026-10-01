import type { MarketplaceFeatureKey } from "@/lib/template-features";

export type MarketplaceFeatureStatus = "enabled" | "pending" | "available";

export type MarketplaceFeature = {
  key: MarketplaceFeatureKey;
  label: string;
  description: string;
  status: MarketplaceFeatureStatus;
  group: string;
};

export type PendingFeatureRequest = {
  id: string;
  featureKey: string;
  featureLabel: string;
  featureDescription: string | null;
  message: string | null;
  requestedAt: string;
  tenant: { id: string; name: string };
  department: { id: string; name: string };
  requester: { id: string; name: string; email: string } | null;
};
