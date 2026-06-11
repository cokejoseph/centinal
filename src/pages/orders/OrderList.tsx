import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, AlertTriangle, Search, PackageOpen } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { Button, Input, Select, Card } from '../../components/ui'
import {
  FulfillmentBadge, PaymentBadge, ChannelBadge,
  RTOScoreBar, PaymentMethodBadge,
} from '../../components/shared/StatusBadge'
import type { Order } from '../../types'

type TabType = 'all' | 'ready' | 'review'

export default function OrderList() {
  const { orders, approveOrder, holdOrder, startPacking } = useAppStore()
  const [tab, setTab] = useState<TabType>('all')
  const [search, setSearch] = useState('')
  const [filterChannel, setFilterChannel] = useState('')
  const [filterPayment, setFilterPayment] = useState('')
  const [filterFulfillment, setFilterFulfillment] = useState('')
  const [filterRTO, setFilterRTO] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  const pendingReviewCount = orders.filter(o => o.rto_review_status === 'PENDING').length

  // "Ready" = paid, not flagged, not yet in packing pipeline
  const readyOrders = useMemo(() =>
    orders.filter(o =>
      o.payment_status === 'PAID' &&
      (o.rto_review_status === 'APPROVED' || o.rto_review_status === 'NOT_REQUIRED') &&
      (o.fulfillment_status === 'CONFIRMED' || o.fulfillment_status === 'PROCESSING')
    ), [orders])

  const filtered = useMemo(() => {
    let list = orders

    if (tab === 'ready') list = readyOrders
    if (tab === 'review') list = orders.filter(o =>
      o.rto_review_status === 'PENDING' || o.rto_review_status === 'HELD'
    )

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(o =>
        o.order_number.toLowerCase().includes(q) ||
        o.customer?.name.toLowerCase().includes(q) ||
        o.customer?.phone.includes(q)
      )
    }
    if (filterChannel) list = list.filter(o => o.channel === filterChannel)
    if (filterPayment) list = list.filter(o => o.payment_status === filterPayment)
    if (filterFulfillment) list = list.filter(o => o.fulfillment_status === filterFulfillment)
    if (filterRTO) {
      list = list.filter(o => {
        if (filterRTO === 'high') return o.rto_risk_score >= 60
        if (filterRTO === 'medium') return o.rto_risk_score >= 30 && o.rto_risk_score < 60
        if (filterRTO === 'low') return o.rto_risk_score < 30
        return true
      })
    }

    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [orders, readyOrders, tab, search, filterChannel, filterPayment, filterFulfillment, filterRTO])

  const highRiskPending = orders.filter(o => o.rto_risk_score >= 60 && o.rto_review_status === 'PENDING').length

  const toggleSelect = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const toggleSelectAll = () =>
    setSelected(prev => prev.length === filtered.length ? [] : filtered.map(o => o.id))

  const handleStartPacking = () => {
    startPacking(selected)
    setSelected([])
  }

  const totalGMV = filtered.reduce((s, o) => s + o.gross_amount - o.discount_amount, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Orders</h1>
        <Link to="/orders/new">
          <Button size="sm"><Plus size={14} /> New Order</Button>
        </Link>
      </div>

      {/* Risk banner */}
      {highRiskPending > 0 && (
        <div
          className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm cursor-pointer"
          onClick={() => { setTab('review'); setSelected([]) }}
        >
          <AlertTriangle size={16} />
          <span>{highRiskPending} high-RTO order{highRiskPending > 1 ? 's' : ''} need review before shipping</span>
          <button className="ml-auto text-amber-700 font-medium text-xs hover:underline">Review now →</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <TabBtn active={tab === 'all'} onClick={() => { setTab('all'); setSelected([]) }}>
          All Orders
        </TabBtn>
        <TabBtn active={tab === 'ready'} onClick={() => { setTab('ready'); setSelected([]) }} badge={readyOrders.length}>
          Ready to Pack
        </TabBtn>
        <TabBtn active={tab === 'review'} onClick={() => { setTab('review'); setSelected([]) }} badge={pendingReviewCount} badgeDanger>
          Review Queue
        </TabBtn>
      </div>

      {/* Bulk action bar — Start Packing (ready tab only) */}
      {tab === 'ready' && selected.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-brand-600 text-white rounded-xl shadow-lg">
          <span className="text-sm font-medium">{selected.length} order{selected.length > 1 ? 's' : ''} selected</span>
          <button
            onClick={handleStartPacking}
            className="flex items-center gap-1.5 ml-auto px-3 py-1.5 bg-white text-brand-700 text-sm font-semibold rounded-lg hover:bg-brand-50 transition-colors"
          >
            <PackageOpen size={14} /> Start Packing
          </button>
          <button onClick={() => setSelected([])} className="text-white/70 hover:text-white text-sm">✕ Clear</button>
        </div>
      )}

      {/* Review Queue bulk actions */}
      {tab === 'review' && selected.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 text-white rounded-xl shadow-lg">
          <span className="text-sm font-medium">{selected.length} order{selected.length > 1 ? 's' : ''} selected</span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => { selected.forEach(id => approveOrder(id)); setSelected([]) }}
              className="px-3 py-1.5 bg-green-500 text-white text-sm font-semibold rounded-lg hover:bg-green-400 transition-colors"
            >
              Approve All
            </button>
            <button
              onClick={() => { selected.forEach(id => holdOrder(id)); setSelected([]) }}
              className="px-3 py-1.5 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-400 transition-colors"
            >
              Hold All
            </button>
          </div>
          <button onClick={() => setSelected([])} className="text-white/70 hover:text-white text-sm">✕ Clear</button>
        </div>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders, customers…" className="pl-8" />
          </div>
          <Select value={filterChannel} onChange={e => setFilterChannel(e.target.value)} className="w-36">
            <option value="">All Channels</option>
            <option value="SHOPIFY">Shopify</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="MANUAL">Manual</option>
            <option value="AMAZON">Amazon</option>
            <option value="FLIPKART">Flipkart</option>
          </Select>
          <Select value={filterPayment} onChange={e => setFilterPayment(e.target.value)} className="w-36">
            <option value="">Payment Status</option>
            <option value="PAID">Paid</option>
            <option value="AWAITING_PAYMENT">Awaiting</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
          </Select>
          <Select value={filterFulfillment} onChange={e => setFilterFulfillment(e.target.value)} className="w-36">
            <option value="">Fulfillment</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="PROCESSING">Processing</option>
            <option value="PACKING">Packing</option>
            <option value="READY_TO_SHIP">Ready to Ship</option>
            <option value="SHIPPED">Shipped</option>
            <option value="IN_TRANSIT">In Transit</option>
            <option value="DELIVERED">Delivered</option>
            <option value="RTO_INITIATED">RTO</option>
          </Select>
          <Select value={filterRTO} onChange={e => setFilterRTO(e.target.value)} className="w-28">
            <option value="">RTO Risk</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
        </div>
      </Card>

      {/* Empty state for ready tab */}
      {tab === 'ready' && filtered.length === 0 && (
        <Card className="p-12 text-center">
          <PackageOpen size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm font-medium">No orders ready to pack</p>
          <p className="text-gray-400 text-xs mt-1">Orders appear here once they're paid and cleared RTO review</p>
        </Card>
      )}

      {/* Table */}
      {(tab !== 'ready' || filtered.length > 0) && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selected.length === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Order</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Channel</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Payment</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">RTO</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Date</th>
                  {tab === 'review' && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="stagger-rows">
                {filtered.map(order => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    selected={selected.includes(order.id)}
                    onSelect={() => toggleSelect(order.id)}
                    showActions={tab === 'review'}
                    onApprove={() => approveOrder(order.id)}
                    onHold={() => holdOrder(order.id)}
                  />
                ))}
                {filtered.length === 0 && tab !== 'ready' && (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-gray-500 text-sm">
                      No orders match your filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>{filtered.length} orders</span>
            <span>GMV: ₹{Math.round(totalGMV).toLocaleString('en-IN')}</span>
          </div>
        </Card>
      )}
    </div>
  )
}

function OrderRow({
  order, selected, onSelect, showActions, onApprove, onHold,
}: {
  order: Order
  selected: boolean
  onSelect: () => void
  showActions: boolean
  onApprove: () => void
  onHold: () => void
}) {
  return (
    <tr className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${selected ? 'bg-brand-50' : ''}`}>
      <td className="px-4 py-3">
        <input type="checkbox" checked={selected} onChange={onSelect} className="rounded" />
      </td>
      <td className="px-4 py-3">
        <Link to={`/orders/${order.id}`} className="text-sm font-medium text-brand-600 hover:underline">
          {order.order_number}
        </Link>
      </td>
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-900">{order.customer?.name}</p>
          <p className="text-xs text-gray-500">{order.customer?.phone}</p>
        </div>
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        <ChannelBadge channel={order.channel} />
      </td>
      <td className="px-4 py-3">
        <span className="text-sm font-medium text-gray-900">
          ₹{(order.gross_amount - order.discount_amount).toLocaleString('en-IN')}
        </span>
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <div className="flex flex-col gap-1">
          <PaymentBadge status={order.payment_status} />
          <PaymentMethodBadge method={order.payment_method} />
        </div>
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <FulfillmentBadge status={order.fulfillment_status} />
      </td>
      <td className="px-4 py-3">
        <RTOScoreBar score={order.rto_risk_score} />
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <span className="text-xs text-gray-500">
          {new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
        </span>
      </td>
      {showActions && (
        <td className="px-4 py-3">
          {order.rto_review_status === 'PENDING' || order.rto_review_status === 'HELD' ? (
            <div className="flex gap-1">
              <button onClick={onApprove} className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
                Approve
              </button>
              <button onClick={onHold} className="px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors">
                Hold
              </button>
            </div>
          ) : (
            <span className="text-xs text-gray-400">{order.rto_review_status}</span>
          )}
        </td>
      )}
    </tr>
  )
}

function TabBtn({
  active, onClick, children, badge, badgeDanger,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  badge?: number
  badgeDanger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
      {badge != null && badge > 0 ? (
        <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-semibold flex items-center justify-center ${
          badgeDanger ? 'bg-red-500' : 'bg-brand-600'
        }`}>
          {badge}
        </span>
      ) : null}
    </button>
  )
}
