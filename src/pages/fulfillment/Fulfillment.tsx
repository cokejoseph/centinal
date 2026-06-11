import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Tag, Calendar } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { Card, Button } from '../../components/ui'
import { FulfillmentBadge, ChannelBadge, PaymentMethodBadge } from '../../components/shared/StatusBadge'
import type { Order } from '../../types'

const TABS = [
  { key: 'pack', label: 'Ready to Pack' },
  { key: 'packing', label: 'Packing' },
  { key: 'ready', label: 'Ready for Pickup' },
  { key: 'pickup', label: 'Pickup Scheduled' },
  { key: 'transit', label: 'In Transit' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'rto', label: 'RTO / Returned' },
] as const

type TabKey = typeof TABS[number]['key']

function getTabOrders(orders: Order[], tab: TabKey): Order[] {
  switch (tab) {
    case 'pack':
      return orders.filter(o => o.fulfillment_status === 'PACKING')
    case 'packing':
      return orders.filter(o => o.fulfillment_status === 'PACKING')
    case 'ready':
      return orders.filter(o => o.fulfillment_status === 'READY_TO_SHIP')
    case 'pickup':
      return orders.filter(o =>
        o.shipments?.some(s => s.status === 'PICKUP_SCHEDULED')
      )
    case 'transit':
      return orders.filter(o =>
        ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(o.fulfillment_status)
      )
    case 'delivered':
      return orders.filter(o => o.fulfillment_status === 'DELIVERED')
    case 'rto':
      return orders.filter(o => o.fulfillment_status === 'RTO_INITIATED')
    default:
      return []
  }
}

export default function Fulfillment() {
  const { orders, generateLabels, updateOrder } = useAppStore()
  const [tab, setTab] = useState<TabKey>('pack')
  const [selected, setSelected] = useState<string[]>([])

  const tabOrders = getTabOrders(orders, tab)

  const toggleSelect = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const toggleAll = () =>
    setSelected(prev => prev.length === tabOrders.length ? [] : tabOrders.map(o => o.id))

  const handleSchedulePickup = () => {
    selected.forEach(id => {
      updateOrder(id, { fulfillment_status: 'READY_TO_SHIP' })
    })
    setSelected([])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Fulfillment</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map(t => {
          const count = getTabOrders(orders, t.key).length
          return (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSelected([]) }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.key
                  ? 'bg-brand-900 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-100'
              }`}
            >
              {t.label}
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  tab === t.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <Card>
        {/* Tab actions */}
        {(tab === 'pack' || tab === 'packing') && selected.length > 0 && (
          <div className="flex gap-2 px-4 pt-4">
            <Button size="sm" onClick={() => { generateLabels(selected); setSelected([]) }}>
              <Tag size={14} /> Generate Labels ({selected.length})
            </Button>
          </div>
        )}
        {tab === 'ready' && selected.length > 0 && (
          <div className="flex gap-2 px-4 pt-4">
            <Button size="sm" onClick={handleSchedulePickup}>
              <Calendar size={14} /> Schedule Pickup ({selected.length})
            </Button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left">
                  <input type="checkbox" checked={selected.length === tabOrders.length && tabOrders.length > 0} onChange={toggleAll} className="rounded" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Order</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Channel</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                {(tab === 'transit' || tab === 'delivered' || tab === 'rto') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">AWB</th>
                )}
              </tr>
            </thead>
            <tbody className="stagger-rows">
              {tabOrders.map(order => {
                const shipment = order.shipments?.[0]
                return (
                  <tr key={order.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${selected.includes(order.id) ? 'bg-brand-50' : ''}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.includes(order.id)} onChange={() => toggleSelect(order.id)} className="rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/orders/${order.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                        {order.order_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{order.customer?.name}</p>
                      <p className="text-xs text-gray-500">{order.shipping_address.city}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <ChannelBadge channel={order.channel} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium">₹{(order.gross_amount - order.discount_amount).toLocaleString('en-IN')}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <PaymentMethodBadge method={order.payment_method} />
                    </td>
                    <td className="px-4 py-3">
                      <FulfillmentBadge status={order.fulfillment_status} />
                    </td>
                    {(tab === 'transit' || tab === 'delivered' || tab === 'rto') && (
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {shipment && (
                          <div>
                            <p className="text-xs font-mono text-gray-700">{shipment.awb_number}</p>
                            <p className="text-xs text-gray-500">{shipment.courier}</p>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
              {tabOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500 text-sm">
                    No orders in this stage
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
          {tabOrders.length} orders
        </div>
      </Card>

    </div>
  )
}
