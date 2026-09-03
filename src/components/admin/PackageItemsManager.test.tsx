import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PackageItemsManager from './PackageItemsManager'

const addPackageItemMock = vi.fn()
const removePackageItemMock = vi.fn()

vi.mock('@/app/(app)/admin/paquetes/actions', () => ({
  addPackageItem: (formData: FormData) => addPackageItemMock(formData),
  removePackageItem: (formData: FormData) => removePackageItemMock(formData),
}))

const PACKAGE_ID = '11111111-1111-1111-1111-111111111111'

const ITEMS = [
  { id: 'item-1', label: "Alojamiento (Casa Campo Villa Mary's)", internal_cost_cents: 15000000, quantity_included: 2 },
]
const SERVICES = [{ id: 'svc-1', label: "Alojamiento (Casa Campo Villa Mary's)" }]
const GUIDE_TOURS = [{ id: 'tour-1', label: 'Chorro de la Vela (María Guía)' }]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PackageItemsManager', () => {
  it('shows the empty message when there are no items yet', () => {
    render(<PackageItemsManager packageId={PACKAGE_ID} items={[]} services={SERVICES} guideTours={GUIDE_TOURS} />)
    expect(screen.getByText('Este paquete todavía no incluye ningún servicio o tour.')).toBeInTheDocument()
  })

  it('renders existing items with their formatted cost and quantity', () => {
    render(<PackageItemsManager packageId={PACKAGE_ID} items={ITEMS} services={[]} guideTours={[]} />)
    expect(screen.getByText("Alojamiento (Casa Campo Villa Mary's)")).toBeInTheDocument()
    expect(screen.getByText(/150.000/)).toBeInTheDocument()
    expect(screen.getByText(/Cantidad incluida: 2/)).toBeInTheDocument()
  })

  it('groups the add-select options under Servicios and Tours de guía', () => {
    render(<PackageItemsManager packageId={PACKAGE_ID} items={[]} services={SERVICES} guideTours={GUIDE_TOURS} />)
    expect(screen.getByRole('group', { name: 'Servicios' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Tours de guía' })).toBeInTheDocument()
  })

  it('submits a combined service:<id> value with cost and quantity to addPackageItem', async () => {
    addPackageItemMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<PackageItemsManager packageId={PACKAGE_ID} items={[]} services={SERVICES} guideTours={GUIDE_TOURS} />)

    await user.selectOptions(screen.getByLabelText('Proveedor'), 'service:svc-1')
    await user.type(screen.getByLabelText('Costo interno (COP)'), '90000')
    await user.click(screen.getByRole('button', { name: 'Agregar' }))

    expect(addPackageItemMock).toHaveBeenCalledTimes(1)
    const fd = addPackageItemMock.mock.calls[0][0] as FormData
    expect(fd.get('packageId')).toBe(PACKAGE_ID)
    expect(fd.get('component')).toBe('service:svc-1')
    expect(fd.get('internal_cost_pesos')).toBe('90000')
    expect(fd.get('quantity_included')).toBe('1')
  })

  it('shows the server-returned error message from addPackageItem', async () => {
    addPackageItemMock.mockResolvedValue({ error: 'El costo interno debe ser un número válido.' })
    const user = userEvent.setup()
    render(<PackageItemsManager packageId={PACKAGE_ID} items={[]} services={SERVICES} guideTours={GUIDE_TOURS} />)

    await user.selectOptions(screen.getByLabelText('Proveedor'), 'service:svc-1')
    await user.type(screen.getByLabelText('Costo interno (COP)'), '90000')
    await user.click(screen.getByRole('button', { name: 'Agregar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El costo interno debe ser un número válido.')
  })

  it('submits itemId and packageId to removePackageItem when removing an item', async () => {
    const user = userEvent.setup()
    render(<PackageItemsManager packageId={PACKAGE_ID} items={ITEMS} services={SERVICES} guideTours={GUIDE_TOURS} />)

    await user.click(screen.getByRole('button', { name: /Quitar/ }))

    expect(removePackageItemMock).toHaveBeenCalledTimes(1)
    const fd = removePackageItemMock.mock.calls[0][0] as FormData
    expect(fd.get('itemId')).toBe('item-1')
    expect(fd.get('packageId')).toBe(PACKAGE_ID)
  })
})
