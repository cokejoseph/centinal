// ─── Auth ──────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
}

// ─── Brand ─────────────────────────────────────────────────────────────────

export interface Brand {
  id: string
  name: string
  owner_id: string
  market_type: 'D2C' | 'B2B' | 'Hybrid'
  status: 'ACTIVE' | 'INACTIVE'
  settings: {
    website_url?: string
    business_type?: string
    currency?: string
    monthly_order_volume?: number
    average_order_value?: number
  }
  created_at: string
}

export interface BrandMember {
  id: string
  brand_id: string
  user_id: string
  role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER'
  name: string
  email: string
  avatar?: string
  created_at: string
}

export type PlanType = 'STARTER' | 'GROWTH' | 'SCALE' | 'ENTERPRISE'

// ─── Integration ───────────────────────────────────────────────────────────

export type IntegrationPlatform =
  | 'SHOPIFY'
  | 'WHATSAPP'
  | 'SHIPROCKET'
  | 'RAZORPAY'
  | 'SHIPPO'
  | 'EASYPOST'

export type IntegrationStatus =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'ERROR'
  | 'PENDING'

export interface Integration {
  id: string
  brand_id: string
  platform: IntegrationPlatform
  status: IntegrationStatus
  credentials: Record<string, string>
  last_sync_at: string | null
  error_message?: string
  created_at: string
}

// ─── Warehouse ─────────────────────────────────────────────────────────────

export interface Warehouse {
  id: string
  brand_id: string
  name: string
  address: string
  city: string
  state: string
  pincode: string
  contact_name: string
  contact_phone: string
  is_primary: boolean
  created_at: string
}

// ─── Product ───────────────────────────────────────────────────────────────

export type ProductCategory =
  | 'Skincare'
  | 'Supplements'
  | 'Food & Beverage'
  | 'Fashion'
  | 'Electronics'
  | 'Home & Kitchen'
  | 'Other'

export interface Product {
  id: string
  brand_id: string
  name: string
  sku: string
  category: ProductCategory
  selling_price: number
  cost_price: number
  inventory_count: number
  reorder_threshold: number
  weight_grams: number
  is_active: boolean
  created_at: string
}

// ─── Customer ──────────────────────────────────────────────────────────────

export interface Customer {
  id: string
  brand_id: string
  name: string
  phone: string
  email: string | null
  address: string | null
  city: string
  state: string
  pincode: string
  total_orders: number
  total_spent: number
  tags: string[]
  created_at: string
}

// ─── Order ─────────────────────────────────────────────────────────────────

export type OrderChannel =
  | 'SHOPIFY'
  | 'WHATSAPP'
  | 'MANUAL'
  | 'AMAZON'
  | 'FLIPKART'

export type PaymentStatus =
  | 'PENDING'
  | 'AWAITING_PAYMENT'
  | 'PAID'
  | 'FAILED'

export type PaymentMethod =
  | 'COD'
  | 'UPI'
  | 'CARD'
  | 'NETBANKING'
  | 'WALLET'
  | 'PREPAID'

export type FulfillmentStatus =
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'PACKING'
  | 'READY_TO_SHIP'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'RTO_INITIATED'
  | 'CANCELLED'

export type RTOReviewStatus = 'PENDING' | 'APPROVED' | 'HELD' | 'FLAGGED'
export type RTORiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export interface ShippingAddress {
  address: string
  city: string
  state: string
  pincode: string
  landmark?: string
}

export interface Order {
  id: string
  brand_id: string
  customer_id: string | null
  order_number: string
  channel: OrderChannel
  gross_amount: number
  discount_amount: number
  shipping_charge?: number
  razorpay_payment_id?: string | null
  razorpay_fee?: number        // in rupees; populated by payment.captured webhook
  razorpay_tax?: number        // GST on fee, in rupees
  shipping_cost?: number       // actual Shiprocket freight charge
  shiprocket_shipment_id?: number | null
  payment_status: PaymentStatus
  payment_method: PaymentMethod
  fulfillment_status: FulfillmentStatus
  rto_risk_score: number
  rto_risk_level?: RTORiskLevel | null
  rto_review_status: RTOReviewStatus
  shipping_address: ShippingAddress
  warehouse_id: string | null
  notes: string | null
  external_ref?: string | null
  created_at: string
  // Populated relations
  customer?: Customer
  items?: OrderItem[]
  shipments?: Shipment[]
  timeline?: OrderTimeline[]
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  product_name?: string | null
  sku: string
  quantity: number
  unit_price: number
  cost_price?: number
  product?: Product
}

// ─── Payment ───────────────────────────────────────────────────────────────

export type LedgerPaymentStatus =
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'REFUNDED'
  | 'SETTLED'

export interface Payment {
  id: string
  brand_id: string
  order_id: string | null
  order_number?: string | null
  amount: number
  method: PaymentMethod
  status: LedgerPaymentStatus
  gateway_ref: string | null
  gateway_fee: number | null
  settlement_amount: number | null
  settled_at: string | null
  created_at: string
  order?: Order
}

// ─── Shipment ──────────────────────────────────────────────────────────────

export type ShipmentStatus =
  | 'LABEL_CREATED'
  | 'PICKUP_SCHEDULED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'RTO_INITIATED'
  | 'RTO_DELIVERED'
  | 'LOST'

export interface Shipment {
  id: string
  brand_id: string
  order_id: string
  courier: string
  awb_number: string
  tracking_number: string | null
  status: ShipmentStatus
  pickup_scheduled_at: string | null
  delivered_at: string | null
  created_at: string
}

export interface OrderTimeline {
  id: string
  order_id: string
  event: string
  actor: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

// ─── Exception ─────────────────────────────────────────────────────────────

export type ExceptionType =
  | 'HIGH_RTO_RISK'
  | 'FAILED_PAYMENT'
  | 'STUCK_SHIPMENT'
  | 'RTO_INITIATED'
  | 'LOW_INVENTORY'
  | 'PENDING_SETTLEMENT'
  | 'FAILED_WEBHOOK'
  | 'ADDRESS_ISSUE'

export type ExceptionSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type ExceptionStatus = 'UNRESOLVED' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED'

export interface Exception {
  id: string
  brand_id: string
  order_id: string | null
  type: ExceptionType
  severity: ExceptionSeverity
  status: ExceptionStatus
  title: string
  description: string
  created_at: string
  order?: Order
}

// ─── Daily Brief ───────────────────────────────────────────────────────────

export interface BriefHeadline {
  total_orders: number
  total_revenue: number
  cogs: number
  true_profit: number
  true_margin: number
  paid_count: number
  cod_count: number
  rto_count: number
}

export interface BriefDeliveryHealth {
  rto_rate: number
  spiked: boolean
  avg_rto_score: number
  high_risk_orders: Array<{ order_number: string; score: number }>
}

export interface BriefAction {
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  text: string
}

export interface BriefData {
  date: string
  headline: BriefHeadline
  delivery_health: BriefDeliveryHealth
  channel_performance: Array<{
    channel: string
    orders: number
    revenue: number
  }>
  product_performance: Array<{
    name: string
    sku: string
    units: number
    revenue: number
    low_stock: boolean
  }>
  customer_health: {
    new_customers: number
    returning_customers: number
    repeat_rate: number
  }
  actions: BriefAction[]
}

export interface DailyBrief {
  id: string
  brand_id: string
  date: string                             // DB column name
  headline: BriefHeadline
  delivery_health: BriefDeliveryHealth
  channel_performance: Array<{ channel: string; orders: number; revenue: number }>
  product_performance: Array<{ name: string; sku: string; units: number; revenue: number; low_stock: boolean }>
  customer_health: { new_customers: number; returning_customers: number; repeat_rate: number }
  actions: BriefAction[]
  generated_by: string | null
  created_at: string
}

// ─── Forecast ──────────────────────────────────────────────────────────────

export type ForecastStatus =
  | 'OUT_OF_STOCK'
  | 'REORDER_NOW'
  | 'REORDER_SOON'
  | 'IN_STOCK'
  | 'DEAD_STOCK'
  | 'INSUFFICIENT_DATA'
  | 'UNPREDICTABLE'

export interface SKUForecast {
  product_id: string
  name: string
  sku: string
  category: string
  inventory_count: number
  avg_daily_demand: number
  total_units_sold_30d: number
  days_of_stock: number
  predicted_stockout_date: string | null
  reorder_quantity: number
  status: ForecastStatus
}

export interface ForecastSummary {
  out_of_stock_count: number
  reorder_now_count: number
  reorder_soon_count: number
  in_stock_count: number
  dead_stock_count: number
  total_skus: number
}

// ─── Reorder / Churn ───────────────────────────────────────────────────────

export type ChurnLevel = 'ACTIVE' | 'AT_RISK' | 'CHURNING' | 'LOST'

export interface ReorderNudge {
  customer_id: string
  customer_name: string
  customer_phone: string
  last_product_name: string
  last_product_sku: string
  days_since_last_order: number
  avg_order_cycle: number
  churn_level: ChurnLevel
  churn_probability: number
  delivery_success_rate: number
  suggested_message: string
}

// ─── RTO Score ─────────────────────────────────────────────────────────────

export interface RTOScoreResult {
  score: number
  level: RTORiskLevel
  factors: string[]
}

// ─── Search ────────────────────────────────────────────────────────────────

export type SearchResultType = 'order' | 'customer' | 'product' | 'shipment'

export interface SearchResult {
  type: SearchResultType
  id: string
  primary: string
  secondary: string
  url: string
}

