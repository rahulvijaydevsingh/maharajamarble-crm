export type CustomerSourceLabelLookup = (
  moduleName: string,
  fieldName: string,
  value: string,
) => string;

export function getCustomerSourceLabel(
  value: string | null | undefined,
  getOptionLabel: CustomerSourceLabelLookup,
): string {
  if (!value) {
    return "—";
  }

  const label = getOptionLabel("leads", "source", value);
  if (label !== value) {
    return label;
  }

  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
