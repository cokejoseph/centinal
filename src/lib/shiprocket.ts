/**
 * shiprocket.ts — Client-side Shiprocket integration helpers for Centinal.
 *
 * Currently covers credential validation + connect flow from
 * Settings → Integrations. Shipment creation, tracking, and label
 * generation will be added alongside the `shiprocket-proxy` edge function
 * when the full Shiprocket integration ships.
 *
 * Shiprocket API base: https://apiv2.shiprocket.in/v1/external
 * Auth: email + password → Bearer JWT (valid for 10 days)
 */

import { supabase, DEMO_MODE } from './supabase'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ShiprocketCredentials {
  email: string
  password: string
  webhook_token?: string   // Optional: for securing incoming webhooks
}

export interface ShiprocketTestResult {
  ok: boolean
  company_name?: string
  email?: string
  error?: string
}

// ─── Credential validation ──────────────────────────────────────────────────

export async function testShiprocketConnection(
  credentials: ShiprocketCredentials
): Promise<ShiprocketTestResult> {
  if (DEMO_MODE) {
    await delay(800)
    return {
      ok: true,
      company_name: 'Zestify Foods Pvt Ltd',
      email: credentials.email,
    }
  }

  try {
    const { data, error } = await supabase!.functions.invoke('shiprocket-proxy', {
      body: { action: 'test_connection', email: credentials.email, password: credentials.password },
    })
    if (error) throw new Error(error.message)
    if (!data?.ok) throw new Error(data?.error ?? 'Connection failed')
    return { ok: true, company_name: data.company_name, email: data.email }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Test failed' }
  }
}

// ─── Full connect flow ─────────────────────────────────────────────────────

export async function connectShiprocket(
  _brandId: string,
  credentials: ShiprocketCredentials,
  onProgress: (message: string) => void
): Promise<{ ok: boolean; error?: string }> {
  onProgress('Authenticating with Shiprocket…')
  const testResult = await testShiprocketConnection(credentials)
  if (!testResult.ok) {
    return { ok: false, error: testResult.error ?? 'Authentication failed' }
  }
  onProgress(`✓ Connected — ${testResult.company_name ?? 'Shiprocket account verified'}`)
  onProgress('Ready to create shipments')
  return { ok: true }
}

// ─── Shipment creation ─────────────────────────────────────────────────────

export interface ShipmentPayload {
  order_number: string
  billing_customer_name: string
  billing_phone: string
  billing_address: string
  billing_city: string
  billing_pincode: string
  billing_state: string
  items: Array<{ name: string; sku: string; units: number; selling_price: number; weight?: number }>
  payment_method: 'COD' | 'Prepaid'
  order_total: number
  weight_kg: number
  length_cm?: number
  breadth_cm?: number
  height_cm?: number
}

export interface CreateShipmentResult {
  ok: boolean
  shipment_id?: number
  awb_code?: string
  courier_name?: string
  label_url?: string
  error?: string
}

export async function createShipment(
  credentials: ShiprocketCredentials,
  payload: ShipmentPayload
): Promise<CreateShipmentResult> {
  if (DEMO_MODE) {
    await delay(1200)
    return {
      ok: true,
      shipment_id: Math.floor(Math.random() * 9000000) + 1000000,
      awb_code: `SR${Date.now()}`.slice(0, 14),
      courier_name: 'Delhivery',
      label_url: '#',
    }
  }
  try {
    const { data, error } = await supabase!.functions.invoke('shiprocket-proxy', {
      body: { action: 'create_shipment', ...credentials, shipment: payload },
    })
    if (error) throw new Error(error.message)
    return data as CreateShipmentResult
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Shipment creation failed' }
  }
}

// ─── Label generation ──────────────────────────────────────────────────────

export async function generateShipmentLabels(
  credentials: ShiprocketCredentials,
  awbs: string[]
): Promise<{ ok: boolean; label_url?: string; error?: string }> {
  if (DEMO_MODE) {
    await delay(800)
    return { ok: true, label_url: '#' }
  }
  try {
    const { data, error } = await supabase!.functions.invoke('shiprocket-proxy', {
      body: { action: 'generate_labels', ...credentials, awbs },
    })
    if (error) throw new Error(error.message)
    return data
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Label generation failed' }
  }
}

// ─── Shipment tracking ─────────────────────────────────────────────────────

export interface TrackingActivity {
  date: string
  activity: string
  location: string
}

export interface TrackingResult {
  ok: boolean
  current_status?: string
  etd?: string
  activities?: TrackingActivity[]
  error?: string
}

export async function trackShipment(
  credentials: ShiprocketCredentials,
  awb: string
): Promise<TrackingResult> {
  if (DEMO_MODE) {
    await delay(600)
    return {
      ok: true,
      current_status: 'In Transit',
      etd: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      activities: [
        { date: new Date().toISOString(), activity: 'Picked up', location: 'Mumbai Hub' },
      ],
    }
  }
  try {
    const { data, error } = await supabase!.functions.invoke('shiprocket-proxy', {
      body: { action: 'track', ...credentials, awb },
    })
    if (error) throw new Error(error.message)
    return data as TrackingResult
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Tracking failed' }
  }
}

// ─── Shipment cancellation ─────────────────────────────────────────────────

export async function cancelShipment(
  credentials: ShiprocketCredentials,
  awbs: string[]
): Promise<{ ok: boolean; error?: string }> {
  if (DEMO_MODE) {
    await delay(600)
    return { ok: true }
  }
  try {
    const { data, error } = await supabase!.functions.invoke('shiprocket-proxy', {
      body: { action: 'cancel_shipment', ...credentials, awbs },
    })
    if (error) throw new Error(error.message)
    return data
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Cancellation failed' }
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
