// Feature flags configuration
// Toggle features without changing code

export const FEATURE_FLAGS = {
  // Renewals module enabled by default - set VITE_RENEWALS_MODULE_ENABLED=false to disable
  RENEWALS_MODULE_ENABLED: import.meta.env.VITE_RENEWALS_MODULE_ENABLED !== 'false',
} as const;

export const isFeatureEnabled = (feature: keyof typeof FEATURE_FLAGS): boolean => {
  return FEATURE_FLAGS[feature];
};