'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createTransportRequest } from '@/app/(app)/transporte/actions'
import { transportCopy } from '@/lib/copy/transport'
import { CALENDAR_WEEKDAYS, CALENDAR_MONTHS, calendarActionLabels } from '@/lib/copy/calendar'
import BlockedDatesPicker from '@/components/shared/BlockedDatesPicker'

type State = { error: string } | void

export type TransporterRouteOption = {
  id: string
  origin: string
  destination: string
  allowsOneWay: boolean
  allowsRoundTrip: boolean
  priceOneWayCents: number | null
  priceRoundTripCents: number | null
  blockedDates: string[]
}

type Props = {
  routes?: TransporterRouteOption[]
}

const CUSTOM_ROUTE_VALUE = ''

export default function TransportRequestForm({ routes = [] }: Props) {
  const [state, formAction, isPending] = useActionState<State, FormData>(
    createTransportRequest,
    undefined,
  )

  const copy = transportCopy.requestForm

  const [selectedRouteId, setSelectedRouteId] = useState(CUSTOM_ROUTE_VALUE)
  const selectedRoute = routes.find((r) => r.id === selectedRouteId) ?? null

  const [tripType, setTripType] = useState<'one_way' | 'round_trip'>('one_way')
  const [pickedDate, setPickedDate] = useState('')
  const [pickedTime, setPickedTime] = useState('')

  // Minimum datetime: now (rounded to next minute) in local time for the
  // free (no-route) picker.
  const minDatetime = new Date(Date.now() + 60_000)
    .toISOString()
    .slice(0, 16)

  useEffect(() => {
    if (state?.error) toast.error(state.error)
  }, [state])

  function handleRouteChange(routeId: string) {
    setSelectedRouteId(routeId)
    const route = routes.find((r) => r.id === routeId)
    if (!route) return
    // Default to a modality the route actually offers, never a disallowed one.
    setTripType(route.allowsOneWay ? 'one_way' : 'round_trip')
  }

  const combinedDatetime = pickedDate && pickedTime ? `${pickedDate}T${pickedTime}` : ''

  return (
    <form action={formAction} className="space-y-5">
      {routes.length > 0 && (
        <div>
          <label htmlFor="transporter_route_id" className="block text-sm font-medium text-foreground mb-1.5">
            {copy.routeLabel}
          </label>
          <select
            id="transporter_route_id"
            name="transporter_route_id"
            value={selectedRouteId}
            onChange={(e) => handleRouteChange(e.target.value)}
            className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value={CUSTOM_ROUTE_VALUE}>{copy.customRouteOption}</option>
            {routes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.origin} → {route.destination}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedRoute ? (
        <>
          <input type="hidden" name="requested_datetime" value={combinedDatetime} />

          {selectedRoute.allowsOneWay && selectedRoute.allowsRoundTrip && (
            <div className="space-y-2">
              <p className="block text-sm font-medium text-foreground">{copy.tripTypeLabel}</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="trip_type"
                    value="one_way"
                    checked={tripType === 'one_way'}
                    onChange={() => setTripType('one_way')}
                  />
                  {copy.oneWayLabel}
                  {selectedRoute.priceOneWayCents != null &&
                    ` ($${(selectedRoute.priceOneWayCents / 100).toLocaleString('es-CO')} COP)`}
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="trip_type"
                    value="round_trip"
                    checked={tripType === 'round_trip'}
                    onChange={() => setTripType('round_trip')}
                  />
                  {copy.roundTripLabel}
                  {selectedRoute.priceRoundTripCents != null &&
                    ` ($${(selectedRoute.priceRoundTripCents / 100).toLocaleString('es-CO')} COP)`}
                </label>
              </div>
            </div>
          )}
          {selectedRoute.allowsOneWay !== selectedRoute.allowsRoundTrip && (
            // Only one modality is offered — no choice to make, but still
            // submit the right trip_type.
            <input type="hidden" name="trip_type" value={selectedRoute.allowsOneWay ? 'one_way' : 'round_trip'} />
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">{copy.requestedDatetime}</label>
            <BlockedDatesPicker
              name="requested_date_picker"
              blockedDates={selectedRoute.blockedDates}
              onSelect={setPickedDate}
              copy={{ ...calendarActionLabels, weekdays: CALENDAR_WEEKDAYS, months: CALENDAR_MONTHS }}
            />
            <input
              type="time"
              value={pickedTime}
              onChange={(e) => setPickedTime(e.target.value)}
              required
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="trip_type" value={tripType} />

          <div>
            <label
              htmlFor="origin"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              {copy.origin} <span aria-hidden="true" className="text-destructive">*</span>
            </label>
            <input
              id="origin"
              name="origin"
              type="text"
              required
              placeholder={copy.originPlaceholder}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label
              htmlFor="destination"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              {copy.destination} <span aria-hidden="true" className="text-destructive">*</span>
            </label>
            <input
              id="destination"
              name="destination"
              type="text"
              required
              placeholder={copy.destinationPlaceholder}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label
              htmlFor="requested_datetime"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              {copy.requestedDatetime} <span aria-hidden="true" className="text-destructive">*</span>
            </label>
            <input
              id="requested_datetime"
              name="requested_datetime"
              type="datetime-local"
              required
              min={minDatetime}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </>
      )}

      <div>
        <label
          htmlFor="people_count"
          className="block text-sm font-medium text-foreground mb-1.5"
        >
          {copy.peopleCount}
        </label>
        <input
          id="people_count"
          name="people_count"
          type="number"
          min="1"
          max="20"
          defaultValue="1"
          required
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div>
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-foreground mb-1.5"
        >
          {copy.notes}
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder={copy.notesPlaceholder}
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground font-semibold text-sm min-h-11 px-6 hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? copy.submitting : copy.submit}
      </button>
    </form>
  )
}
