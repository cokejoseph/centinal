import { create } from 'zustand'
import { DEMO_MODE } from '../lib/supabase'
import {
  DEMO_BRAND, DEMO_TEAM, DEMO_WAREHOUSES, DEMO_PRODUCTS,
  DEMO_CUSTOMERS, DEMO_ORDERS, DEMO_PAYMENTS, DEMO_EXCEPTIONS, DEMO_INTEGRATIONS,
} from '../data/seed'
import { mockGenerateLabels } from '../lib/services'
import { createShipment } from '../lib/shiprocket'
import type { ShipmentPayload } from '../lib/shiprocket'
import type {
  Brand, BrandMember, Warehouse, Product, Customer, Order,
  Payment, Exception, Integration, PlanType,
} from '../types'
import { supabase } from '../lib/supabase'
import {
  getBrandForUser,
  updateBrandDB,
  getTeamMembers,
  inviteTeamMemberDB,
  updateTeamMemberDB,
  removeTeamMemberDB,
  getWarehouses,
  addWarehouseDB,
  updateWarehouseDB,
  setDefaultWarehouseDB,
  getProducts,
  addProductDB,
  updateProductDB,
  getCustomers,
  getOrders,
  updateOrderDB,
  addOrderTimelineEvent,
  getPayments,
  getExceptions,
  updateExceptionDB,
  getIntegrations,
  upsertIntegration,
  updateIntegrationDB,
  subscribeToOrders,
  subscribeToExceptions,
} from '../lib/db'

// ─── Module-level channel storage (outside Zustand to avoid serialisation issues) ─

type RealtimeChannel = ReturnType<typeof subscribeToOrders>
let _realtimeChannels: RealtimeChannel[] = []

// ─── State Interface ────────────────────────────────────────────────────────

interface AppState {
  currentBrand: Brand | null
  currentWarehouse: Warehouse | null
  brands: Brand[]
  orders: Order[]
  payments: Payment[]
  exceptions: Exception[]
  customers: Customer[]
  products: Product[]
  warehouses: Warehouse[]
  teamMembers: BrandMember[]
  integrations: Integration[]
  currentPlan: PlanType
  isLoading: boolean
  bootstrapError: string | null

  bootstrap: (userId: string) => Promise<void>
  cleanup: () => void

  updateOrder: (id: string, changes: Partial<Order>) => void
  approveOrder: (id: string) => void
  holdOrder: (id: string) => void
  flagOrder: (id: string) => void
  bulkApprove: (ids: string[]) => void
  bulkHold: (ids: string[]) => void
  generateLabels: (ids: string[]) => { results: ReturnType<typeof mockGenerateLabels>['results']; merged_pdf_url: string }
  resolveException: (id: string) => void
  dismissException: (id: string) => void
  addProduct: (product: Omit<Product, 'id' | 'brand_id' | 'created_at'>) => void
  updateProduct: (id: string, changes: Partial<Product>) => void
  addWarehouse: (warehouse: Omit<Warehouse, 'id' | 'brand_id' | 'created_at'>) => void
  updateWarehouse: (id: string, changes: Partial<Warehouse>) => void
  setDefaultWarehouse: (id: string) => void
  updateBrand: (changes: Partial<Brand['settings']> & { name?: string }) => void
  updateIntegration: (id: string, changes: Partial<Integration>) => void
  connectIntegration: (platform: Integration['platform'], credentials: Record<string, string>) => Promise<{ error: string | null }>
  updateTeamMember: (id: string, changes: Partial<BrandMember>) => void
  removeTeamMember: (id: string) => void
  inviteTeamMember: (data: { name: string; email: string; role: BrandMember['role'] }) => void
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set, get) => ({
  currentBrand: null,
  currentWarehouse: null,
  brands: [],
  orders: [],
  payments: [],
  exceptions: [],
  customers: [],
  products: [],
  warehouses: [],
  teamMembers: [],
  integrations: [],
  currentPlan: 'GROWTH',
  isLoading: true,
  bootstrapError: null,

  // ─── Bootstrap ─────────────────────────────────────────────────────────────

  bootstrap: async (userId: string) => {
    // Demo mode: env-var flag OR the special demo user ID (used by "Try Demo" button)
    if (DEMO_MODE || userId === 'user-demo-001') {
      set({
        currentBrand: DEMO_BRAND,
        currentWarehouse: DEMO_WAREHOUSES[0],
        brands: [DEMO_BRAND],
        orders: DEMO_ORDERS,
        payments: DEMO_PAYMENTS,
        exceptions: DEMO_EXCEPTIONS,
        customers: DEMO_CUSTOMERS,
        products: DEMO_PRODUCTS,
        warehouses: DEMO_WAREHOUSES,
        teamMembers: DEMO_TEAM,
        integrations: DEMO_INTEGRATIONS,
        currentPlan: 'GROWTH',
        isLoading: false,
        bootstrapError: null,
      })
      return
    }

    // ── Live mode ──────────────────────────────────────────────────────────
    set({ isLoading: true, bootstrapError: null })

    try {
      // Step 1: resolve the user's brand
      const brand = await getBrandForUser(userId)
      if (!brand) {
        set({ isLoading: false, bootstrapError: 'No brand found for this user.' })
        return
      }
      const brandId = brand.id

      // Step 2: parallel fetch of everything else
      const [
        warehouses,
        products,
        customers,
        orders,
        payments,
        exceptions,
        integrations,
        teamMembers,
      ] = await Promise.all([
        getWarehouses(brandId),
        getProducts(brandId),
        getCustomers(brandId),
        getOrders(brandId),
        getPayments(brandId),
        getExceptions(brandId),
        getIntegrations(brandId),
        getTeamMembers(brandId),
      ])

      const primaryWarehouse = warehouses.find(w => w.is_primary) ?? warehouses[0] ?? null

      set({
        currentBrand: brand,
        currentWarehouse: primaryWarehouse,
        brands: [brand],
        orders,
        payments,
        exceptions,
        customers,
        products,
        warehouses,
        teamMembers,
        integrations,
        currentPlan: 'GROWTH',
        isLoading: false,
        bootstrapError: null,
      })

      // Step 3: realtime subscriptions
      _realtimeChannels.forEach(ch => (ch as any).unsubscribe?.())
      _realtimeChannels = []

      const ordersChannel = subscribeToOrders(
        brandId,
        // onInsert
        (newOrder) => {
          set(state => ({ orders: [newOrder, ...state.orders] }))
        },
        // onUpdate
        (updated) => {
          set(state => ({
            orders: state.orders.map(o =>
              o.id === updated.id ? { ...o, ...updated } : o
            ),
          }))
        }
      )

      const exceptionsChannel = subscribeToExceptions(
        brandId,
        (newExc) => {
          set(state => ({ exceptions: [newExc, ...state.exceptions] }))
        }
      )

      _realtimeChannels = [ordersChannel, exceptionsChannel]
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Bootstrap failed'
      set({ isLoading: false, bootstrapError: msg })
    }
  },

  // Unsubscribe from all realtime channels (call on unmount or sign-out)
  cleanup: () => {
    if (supabase) {
      _realtimeChannels.forEach(ch => supabase!.removeChannel(ch))
    }
    _realtimeChannels = []
  },

  // ─── Orders ────────────────────────────────────────────────────────────────

  updateOrder: (id, changes) => {
    // Optimistic local update
    set(state => ({ orders: state.orders.map(o => o.id === id ? { ...o, ...changes } : o) }))
    // Persist to DB in background (non-blocking)
    if (!DEMO_MODE) {
      updateOrderDB(id, changes).catch(console.error)
    }
  },

  approveOrder: (id) => {
    set(state => ({ orders: state.orders.map(o => o.id === id ? { ...o, rto_review_status: 'APPROVED' } : o) }))
    if (!DEMO_MODE) {
      updateOrderDB(id, { rto_review_status: 'APPROVED' }).catch(console.error)
      addOrderTimelineEvent(id, 'Order approved by review', 'system').catch(console.error)
    }
  },

  holdOrder: (id) => {
    set(state => ({ orders: state.orders.map(o => o.id === id ? { ...o, rto_review_status: 'HELD' } : o) }))
    if (!DEMO_MODE) {
      updateOrderDB(id, { rto_review_status: 'HELD' }).catch(console.error)
      addOrderTimelineEvent(id, 'Order placed on hold', 'system').catch(console.error)
    }
  },

  flagOrder: (id) => {
    set(state => ({ orders: state.orders.map(o => o.id === id ? { ...o, rto_review_status: 'FLAGGED' } : o) }))
    if (!DEMO_MODE) {
      updateOrderDB(id, { rto_review_status: 'FLAGGED' }).catch(console.error)
      addOrderTimelineEvent(id, 'Order flagged for review', 'system').catch(console.error)
    }
  },

  bulkApprove: (ids) => {
    set(state => ({
      orders: state.orders.map(o =>
        ids.includes(o.id) ? { ...o, rto_review_status: 'APPROVED' } : o
      ),
    }))
    if (!DEMO_MODE) {
      ids.forEach(id => updateOrderDB(id, { rto_review_status: 'APPROVED' }).catch(console.error))
    }
  },

  bulkHold: (ids) => {
    set(state => ({
      orders: state.orders.map(o =>
        ids.includes(o.id) ? { ...o, rto_review_status: 'HELD' } : o
      ),
    }))
    if (!DEMO_MODE) {
      ids.forEach(id => updateOrderDB(id, { rto_review_status: 'HELD' }).catch(console.error))
    }
  },

  generateLabels: (ids) => {
    // Optimistic update using mock while real API calls run in background
    const result = mockGenerateLabels(ids)
    const { orders, integrations } = get()

    const srIntegration = integrations.find(i => i.platform === 'SHIPROCKET' && i.status === 'CONNECTED')

    const updatedOrders = orders.map(o => {
      const labelResult = result.results.find(r => r.order_id === o.id)
      if (!labelResult) return o

      // Fire real Shiprocket call when credentials are available
      if (!DEMO_MODE && srIntegration) {
        const payload: ShipmentPayload = {
          order_number: o.order_number,
          billing_customer_name: o.shipping_address.name,
          billing_phone: o.shipping_address.phone,
          billing_address: o.shipping_address.address,
          billing_city: o.shipping_address.city,
          billing_pincode: o.shipping_address.pincode,
          billing_state: o.shipping_address.state,
          payment_method: o.payment_method === 'COD' ? 'COD' : 'Prepaid',
          order_total: o.gross_amount - o.discount_amount,
          weight_kg: 0.5,
          items: (o.items ?? []).map(item => ({
            name: item.product_name ?? item.sku,
            sku: item.sku,
            units: item.quantity,
            selling_price: item.unit_price,
          })),
        }
        createShipment(
          { email: srIntegration.credentials.email, password: srIntegration.credentials.password },
          payload
        ).then(res => {
          if (res.ok && res.awb_code) {
            // Update order with real AWB + shipment ID
            set(state => ({
              orders: state.orders.map(order =>
                order.id !== o.id ? order : {
                  ...order,
                  shiprocket_shipment_id: res.shipment_id,
                  shipments: order.shipments?.map(s =>
                    s.order_id === o.id
                      ? { ...s, awb_number: res.awb_code!, courier: res.courier_name ?? s.courier }
                      : s
                  ),
                }
              ),
            }))
            updateOrderDB(o.id, {
              fulfillment_status: 'READY_TO_SHIP',
              shiprocket_shipment_id: res.shipment_id,
            }).catch(console.error)
            addOrderTimelineEvent(o.id, `Shipment created via Shiprocket. AWB: ${res.awb_code} (${res.courier_name})`, 'system').catch(console.error)
          }
        }).catch(console.error)
      } else if (!DEMO_MODE) {
        // No Shiprocket connected — just persist the status
        updateOrderDB(o.id, { fulfillment_status: 'READY_TO_SHIP' }).catch(console.error)
        addOrderTimelineEvent(o.id, `Shipping label created. AWB: ${labelResult.awb_number}`, 'system').catch(console.error)
      }

      return {
        ...o,
        fulfillment_status: 'READY_TO_SHIP' as const,
        shipments: [
          ...(o.shipments ?? []),
          {
            id: `ship-generated-${o.id}`,
            brand_id: o.brand_id,
            order_id: o.id,
            courier: labelResult.courier,
            awb_number: labelResult.awb_number,
            tracking_number: labelResult.awb_number,
            status: 'LABEL_CREATED' as const,
            pickup_scheduled_at: null,
            delivered_at: null,
            created_at: new Date().toISOString(),
          },
        ],
      }
    })
    set({ orders: updatedOrders })
    return result
  },

  // ─── Exceptions ────────────────────────────────────────────────────────────

  resolveException: (id) => {
    set(state => ({ exceptions: state.exceptions.map(e => e.id === id ? { ...e, status: 'RESOLVED' } : e) }))
    if (!DEMO_MODE) {
      updateExceptionDB(id, { status: 'RESOLVED' }).catch(console.error)
    }
  },

  dismissException: (id) => {
    set(state => ({ exceptions: state.exceptions.map(e => e.id === id ? { ...e, status: 'DISMISSED' } : e) }))
    if (!DEMO_MODE) {
      updateExceptionDB(id, { status: 'DISMISSED' }).catch(console.error)
    }
  },

  // ─── Products ──────────────────────────────────────────────────────────────

  addProduct: (product) => {
    const brandId = get().currentBrand?.id ?? ''
    const tempId = `prod-${Date.now()}`
    const newProduct: Product = {
      ...product,
      id: tempId,
      brand_id: brandId,
      created_at: new Date().toISOString(),
    }
    set(state => ({ products: [...state.products, newProduct] }))

    if (!DEMO_MODE) {
      addProductDB({ ...product, brand_id: brandId })
        .then(({ data, error }) => {
          if (error) { console.error('addProduct DB error:', error); return }
          if (!data) return
          // Replace temp ID with real DB id
          set(state => ({
            products: state.products.map(p => p.id === tempId ? data : p),
          }))
        })
        .catch(console.error)
    }
  },

  updateProduct: (id, changes) => {
    set(state => ({ products: state.products.map(p => p.id === id ? { ...p, ...changes } : p) }))
    if (!DEMO_MODE) {
      updateProductDB(id, changes).catch(console.error)
    }
  },

  // ─── Warehouses ────────────────────────────────────────────────────────────

  addWarehouse: (warehouse) => {
    const brandId = get().currentBrand?.id ?? ''
    const tempId = `wh-${Date.now()}`
    const newWarehouse: Warehouse = {
      ...warehouse,
      id: tempId,
      brand_id: brandId,
      created_at: new Date().toISOString(),
    }
    set(state => ({ warehouses: [...state.warehouses, newWarehouse] }))

    if (!DEMO_MODE) {
      addWarehouseDB({ ...warehouse, brand_id: brandId })
        .then(({ data, error }) => {
          if (error) { console.error('addWarehouse DB error:', error); return }
          if (!data) return
          set(state => ({
            warehouses: state.warehouses.map(w => w.id === tempId ? data : w),
          }))
        })
        .catch(console.error)
    }
  },

  updateWarehouse: (id, changes) => {
    set(state => ({ warehouses: state.warehouses.map(w => w.id === id ? { ...w, ...changes } : w) }))
    if (!DEMO_MODE) {
      updateWarehouseDB(id, changes).catch(console.error)
    }
  },

  setDefaultWarehouse: (id) => {
    set(state => ({
      warehouses: state.warehouses.map(w => ({ ...w, is_primary: w.id === id })),
      currentWarehouse: state.warehouses.find(w => w.id === id) ?? state.currentWarehouse,
    }))
    if (!DEMO_MODE) {
      const brandId = get().currentBrand?.id ?? ''
      setDefaultWarehouseDB(brandId, id).catch(console.error)
    }
  },

  // ─── Brand ─────────────────────────────────────────────────────────────────

  updateBrand: (changes) => {
    set(state => {
      if (!state.currentBrand) return state
      const { name, ...settingsChanges } = changes
      const updatedBrand: Brand = {
        ...state.currentBrand,
        ...(name ? { name } : {}),
        settings: { ...state.currentBrand.settings, ...settingsChanges },
      }

      if (!DEMO_MODE) {
        // Build the DB payload: name at top level, rest goes into settings JSONB
        const dbChanges: Partial<Brand> = {}
        if (name) dbChanges.name = name
        if (Object.keys(settingsChanges).length > 0) {
          dbChanges.settings = updatedBrand.settings
        }
        updateBrandDB(state.currentBrand.id, dbChanges).catch(console.error)
      }

      return { currentBrand: updatedBrand }
    })
  },

  // ─── Integrations ──────────────────────────────────────────────────────────

  updateIntegration: (id, changes) => {
    set(state => ({ integrations: state.integrations.map(i => i.id === id ? { ...i, ...changes } : i) }))
    if (!DEMO_MODE) {
      updateIntegrationDB(id, changes).catch(console.error)
    }
  },

  connectIntegration: async (platform, credentials) => {
    const brandId = get().currentBrand?.id ?? ''
    if (!brandId) return { error: 'No brand found' }

    // Optimistic: mark as CONNECTED locally
    set(state => ({
      integrations: state.integrations.map(i =>
        i.platform === platform
          ? { ...i, status: 'CONNECTED', credentials, last_sync_at: new Date().toISOString() }
          : i
      ),
    }))

    if (!DEMO_MODE) {
      const { error } = await upsertIntegration({
        brand_id: brandId,
        platform,
        status: 'CONNECTED',
        credentials,
        last_sync_at: new Date().toISOString(),
      })
      if (error) {
        // Rollback local state
        set(state => ({
          integrations: state.integrations.map(i =>
            i.platform === platform ? { ...i, status: 'DISCONNECTED' } : i
          ),
        }))
        return { error }
      }
    }
    return { error: null }
  },

  // ─── Team ──────────────────────────────────────────────────────────────────

  updateTeamMember: (id, changes) => {
    set(state => ({ teamMembers: state.teamMembers.map(m => m.id === id ? { ...m, ...changes } : m) }))
    if (!DEMO_MODE) {
      updateTeamMemberDB(id, changes).catch(console.error)
    }
  },

  removeTeamMember: (id) => {
    set(state => ({ teamMembers: state.teamMembers.filter(m => m.id !== id) }))
    if (!DEMO_MODE) {
      removeTeamMemberDB(id).catch(console.error)
    }
  },

  inviteTeamMember: (data) => {
    const brandId = get().currentBrand?.id ?? ''
    const tempId = `member-${Date.now()}`
    set(state => ({
      teamMembers: [
        ...state.teamMembers,
        {
          id: tempId,
          brand_id: brandId,
          user_id: `user-${Date.now()}`,
          role: data.role,
          name: data.name,
          email: data.email,
          created_at: new Date().toISOString(),
        },
      ],
    }))
    if (!DEMO_MODE) {
      inviteTeamMemberDB(brandId, data.name, data.email, data.role)
        .then(({ error }) => {
          if (error) console.error('inviteTeamMember DB error:', error)
        })
        .catch(console.error)
    }
  },
}))
