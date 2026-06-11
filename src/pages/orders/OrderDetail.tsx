import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { ArrowLeft, MapPin, Package, Clock, User, Truck, CreditCard, ShieldAlert } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { Card, Badge } from '../../components/ui'
import {
  FulfillmentBadge, PaymentBadge, ChannelBadge,
  ShipmentStatusBadge, PaymentMethodBadge,
} from '../../components/shared/StatusBadge'
import { calculateRTOScore } from '../../lib/services'
import { lookupPincode } from '../../lib/pincodeService'
import type { PincodeResult } from '../../lib/pincodeService'

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const { orders, products, customers } = useAppStore()
  const order = orders.find(o => o.id === id)
  const [pincodeData, setPincodeData] = useState<PincodeResult | null>(null)

  useEffect(() => {
    if (!order?.shipping_address.pincode) return
    lookupPincode(order.shipping_address.pincode).then(setPincodeData)
  }, [order?.shipping_address.pincode])

  if (!order) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Order not found</p>
        <Link to="/orders" className="text-brand-600 mt-2 inline-block hover:underline">← Back to Orders</Link>
      </div>
    )
  }

  const customer = order.customer ?? customers.find(c => c.id === order.customer_id)
  const items = order.items ?? []

  // P&L waterfall
  const revenue = order.gross_amount
  const discount = order.discount_amount
  const cogs = items.reduce((s, item) => {
    const p = products.find(x => x.id === item.product_id)
    return s + (p?.cost_price ?? 0) * item.quantity
  }, 0)
  const shippingCost = order.shipping_cost ?? 60
  const txnFee = (order.razorpay_fee ?? 0) + (order.razorpay_tax ?? 0)
  const rtoReserve = order.rto_risk_score >= 60 ? Math.round(revenue * 0.05) : 0
  const netProfit = revenue - discount - cogs - shippingCost - txnFee - rtoReserve
  const margin = revenue > 0 ? (netProfit / (revenue - discount)) * 100 : 0

  // RTO score — enriched with live pincode data
  const rtoResult = calculateRTOScore({
    payment_method: order.payment_method,
    pincode: order.shipping_address.pincode,
    customer_id: order.customer_id,
    order_value: order.gross_amount,
    brand_aov: 450,
    is_first_order: (customer?.total_orders ?? 1) <= 1,
    has_prior_rto: customer?.tags?.includes('rto-history') ?? false,
    address_complete: !!(order.shipping_address.address && order.shipping_address.pincode),
    pincodeData,
  })

  const shipment = order.shipments?.[0]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/orders" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-gray-900">{order.order_number}</h1>
            <ChannelBadge channel={order.channel} />
            <FulfillmentBadge status={order.fulfillment_status} />
            <PaymentBadge status={order.payment_status} />
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date(order.created_at).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Order Items */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Package size={16} className="text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Order Items</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-2 text-left text-xs text-gray-500 font-medium">Product</th>
                  <th className="pb-2 text-right text-xs text-gray-500 font-medium">Qty</th>
                  <th className="pb-2 text-right text-xs text-gray-500 font-medium">Unit Price</th>
                  <th className="pb-2 text-right text-xs text-gray-500 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map(item => (
                  <tr key={item.id}>
                    <td className="py-2">
                      <p className="font-medium text-gray-900">{item.product?.name ?? item.sku}</p>
                      <p className="text-xs text-gray-500">SKU: {item.sku}</p>
                    </td>
                    <td className="py-2 text-right text-gray-700">{item.quantity}</td>
                    <td className="py-2 text-right text-gray-700">₹{item.unit_price.toLocaleString('en-IN')}</td>
                    <td className="py-2 text-right font-medium text-gray-900">₹{(item.unit_price * item.quantity).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td colSpan={3} className="pt-3 text-sm font-semibold text-gray-900">Total</td>
                  <td className="pt-3 text-right text-sm font-bold text-gray-900">₹{(order.gross_amount - order.discount_amount).toLocaleString('en-IN')}</td>
                </tr>
              </tfoot>
            </table>
          </Card>

          {/* P&L Waterfall */}
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">P&L Breakdown</h2>
            <div className="space-y-2">
              <PLRow label="Gross Revenue" value={revenue} positive />
              {discount > 0 && <PLRow label="Discount" value={-discount} />}
              <PLRow label="COGS" value={-cogs} />
              <PLRow label="Shipping Cost" value={-shippingCost} />
              {txnFee > 0
                ? <PLRow label={`Transaction Fee${order.razorpay_tax ? ' (incl. GST)' : ''}`} value={-txnFee} />
                : <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Transaction Fee</span>
                    <span className="text-gray-400 text-xs italic">pending payment</span>
                  </div>
              }
              {rtoReserve > 0 && <PLRow label="RTO Reserve (5%)" value={-rtoReserve} />}
              <div className="border-t border-gray-200 pt-2 flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-900">Net Profit</span>
                <div className="text-right">
                  <span className={`text-base font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ₹{Math.round(netProfit).toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs text-gray-500 ml-2">({Math.round(margin)}% margin)</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Shipment tracking */}
          {shipment && (
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Truck size={16} className="text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-900">Shipment</h2>
              </div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{shipment.courier}</p>
                  <p className="text-xs text-gray-500 font-mono">AWB: {shipment.awb_number}</p>
                </div>
                <ShipmentStatusBadge status={shipment.status} />
              </div>
            </Card>
          )}

          {/* Order Timeline */}
          {(order.timeline ?? []).length > 0 && (
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock size={16} className="text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-900">Timeline</h2>
              </div>
              <div className="space-y-3">
                {(order.timeline ?? []).map(event => (
                  <div key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-brand-600 mt-1 shrink-0" />
                      <div className="w-px flex-1 bg-gray-100 mt-1" />
                    </div>
                    <div className="pb-3 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{event.event.replace(/_/g, ' ')}</p>
                      {event.actor && <p className="text-xs text-gray-500">{event.actor}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(event.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Customer */}
          {customer && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <User size={15} className="text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-900">Customer</h2>
              </div>
              <Link to={`/customers/${customer.id}`} className="block hover:bg-gray-50 rounded-xl p-2 -mx-2 transition-colors">
                <p className="text-sm font-medium text-brand-600">{customer.name}</p>
                <p className="text-xs text-gray-500">{customer.phone}</p>
                {customer.email && <p className="text-xs text-gray-500">{customer.email}</p>}
              </Link>
              <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-center">
                <div>
                  <p className="text-base font-bold text-gray-900">{customer.total_orders}</p>
                  <p className="text-xs text-gray-500">Orders</p>
                </div>
                <div>
                  <p className="text-base font-bold text-gray-900">₹{customer.total_spent.toLocaleString('en-IN')}</p>
                  <p className="text-xs text-gray-500">Lifetime</p>
                </div>
              </div>
            </Card>
          )}

          {/* Shipping Address */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={15} className="text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Shipping Address</h2>
            </div>
            <p className="text-sm text-gray-700">{order.shipping_address.address}</p>
            <p className="text-sm text-gray-700">
              {order.shipping_address.city}, {order.shipping_address.state}
            </p>
            <p className="text-sm text-gray-500">{order.shipping_address.pincode}</p>
          </Card>

          {/* RTO Intelligence */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert size={15} className="text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">RTO Intelligence</h2>
            </div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl font-bold text-gray-900">{rtoResult.score}</span>
              <Badge
                variant={rtoResult.level === 'HIGH' ? 'danger' : rtoResult.level === 'MEDIUM' ? 'warning' : 'success'}
              >
                {rtoResult.level} RISK
              </Badge>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full mb-3">
              <div
                className={`h-full rounded-full transition-all duration-500 ${rtoResult.score >= 60 ? 'bg-red-500' : rtoResult.score >= 30 ? 'bg-amber-500' : 'bg-green-500'}`}
                style={{ width: `${rtoResult.score}%` }}
              />
            </div>

            {/* Pincode location context */}
            {pincodeData && (
              <div className="mb-3 px-2.5 py-2 bg-gray-50 rounded-lg text-xs text-gray-600 space-y-0.5">
                <p className="font-medium text-gray-700">{pincodeData.district}, {pincodeData.state}</p>
                <div className="flex flex-wrap gap-x-3">
                  <span>Tier {pincodeData.tier}</span>
                  {pincodeData.isRural && <span className="text-amber-600">Rural area</span>}
                  {!pincodeData.deliverable && <span className="text-red-600 font-medium">Non-deliverable</span>}
                  {pincodeData.highRiskState && <span className="text-red-600">High-risk region</span>}
                </div>
              </div>
            )}

            <div className="space-y-1">
              {rtoResult.factors.map((f, i) => (
                <p key={i} className="text-xs text-gray-600">• {f}</p>
              ))}
            </div>
          </Card>

          {/* Payment */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard size={15} className="text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Payment</h2>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Method</span>
                <PaymentMethodBadge method={order.payment_method} />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Amount</span>
                <span className="font-medium text-gray-900">₹{(order.gross_amount - order.discount_amount).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <PaymentBadge status={order.payment_status} />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function PLRow({ label, value, positive = false }: { label: string; value: number; positive?: boolean }) {
  const display = value < 0 ? `−₹${Math.abs(Math.round(value)).toLocaleString('en-IN')}` : `₹${Math.round(value).toLocaleString('en-IN')}`
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={positive ? 'font-medium text-gray-900' : 'text-gray-600'}>{display}</span>
    </div>
  )
}
