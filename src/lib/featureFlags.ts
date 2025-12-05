// Feature flags configuration
// Toggle features without changing code

export const FEATURE_FLAGS = {
  // Renewals module disabled
  RENEWALS_MODULE_ENABLED: false,
} as const;

export const isFeatureEnabled = (feature: keyof typeof FEATURE_FLAGS): boolean => {
  return FEATURE_FLAGS[feature];
};
