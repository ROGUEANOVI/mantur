import type { ReactNode } from 'react'
import { Check, Clock, Gauge, MapPin, Users } from 'lucide-react'
import { packagesCopy } from '@/lib/copy/packages'
import { describeTier, type PackageContentFields, type PriceTier } from '@/lib/packages/content'

type Props = {
  content: PackageContentFields
  tiers: PriceTier[]
  // package_items rows (providers) rendered under "Qué incluye" when present.
  providerItems?: ReactNode
}

// Structured package content in the order a buyer scans it (spec phase 2):
// logistics → itinerary → what's included → what to bring → group prices →
// payment & cancellation. Every section hides itself when empty — no
// placeholders on a sales page.
export default function PackageDetailSections({ content, tiers, providerItems }: Props) {
  const copy = packagesCopy.detail

  const details = [
    content.duration_label && { icon: Clock, label: copy.durationLabel, value: content.duration_label },
    content.meeting_point && { icon: MapPin, label: copy.meetingPointLabel, value: content.meeting_point },
    content.difficulty && {
      icon: Gauge,
      label: copy.difficultyLabel,
      value: copy.difficultyValues[content.difficulty] ?? content.difficulty,
    },
    content.min_people && { icon: Users, label: copy.minPeopleLabel, value: copy.minPeopleValue(content.min_people) },
  ].filter(Boolean) as { icon: typeof Clock; label: string; value: string }[]

  const hasIncluded = content.includes.length > 0 || !!providerItems

  return (
    <div className="space-y-6">
      {details.length > 0 && (
        <Section title={copy.detailsTitle}>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {details.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-2.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-sm font-medium text-foreground">{value}</dd>
                </div>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {content.itinerary.length > 0 && (
        <Section title={copy.itineraryTitle}>
          <ol className="space-y-3">
            {content.itinerary.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums"
                >
                  {i + 1}
                </span>
                <span className="pt-0.5 text-sm leading-relaxed text-foreground/90">{step}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {hasIncluded && (
        <Section title={copy.includedTitle}>
          {content.includes.length > 0 && <CheckList items={content.includes} />}
          {providerItems}
        </Section>
      )}

      {content.what_to_bring.length > 0 && (
        <Section title={copy.whatToBringTitle}>
          <ul className="flex flex-wrap gap-2">
            {content.what_to_bring.map((item, i) => (
              <li key={i} className="rounded-full bg-muted px-3 py-1 text-sm text-foreground">
                {item}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {tiers.length > 0 && (
        <Section title={copy.tiersTitle}>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {tiers.map((tier) => {
                const row = describeTier(tier)
                return (
                  <tr key={`${tier.min_people}-${tier.max_people ?? 'plus'}`}>
                    <th scope="row" className="py-2 pr-3 text-left font-normal text-muted-foreground">
                      {row.people}
                    </th>
                    <td className="py-2 text-right font-semibold text-foreground tabular-nums">{row.price}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>
      )}

      {content.payment_info && (
        <Section title={copy.paymentTitle}>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">{content.payment_info}</p>
        </Section>
      )}

      {content.cancellation_policy && (
        <Section title={copy.cancellationTitle}>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">
            {content.cancellation_policy}
          </p>
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  )
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/90">
          <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
