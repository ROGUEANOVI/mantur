import { packagesCopy } from '@/lib/copy/packages'

// "Desde $150.000 por persona" — the single price wording every package
// surface uses. Several packages are priced by group size (their
// base_price is the lowest real fare), so the amount is always a floor.
export function packagePriceParts(basePrice: number | string, pricingUnit: string) {
  return {
    from: packagesCopy.price.from,
    amount: `$${Number(basePrice).toLocaleString('es-CO')}`,
    unit: packagesCopy.price.unit[pricingUnit] ?? '',
  }
}

export function packagePriceText(basePrice: number | string, pricingUnit: string): string {
  const { from, amount, unit } = packagePriceParts(basePrice, pricingUnit)
  return [from, amount, unit].filter(Boolean).join(' ')
}
