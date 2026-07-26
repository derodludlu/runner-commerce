export const formatCurrency = (value?: number | null) =>
  `R ${Number(value || 0).toFixed(2)}`;
