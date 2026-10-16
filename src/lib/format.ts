// Gregorian calendar + Latin digits, as most Saudi stores display prices and dates.
const LOCALE = "ar-SA-u-ca-gregory-nu-latn";

const sar = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function formatPrice(value: number): string {
  return sar.format(value);
}

const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Riyadh",
});

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}
