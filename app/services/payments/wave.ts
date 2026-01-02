// app/services/payments/wave.ts
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import { isProd, devIp } from '../../Utils/functions.js'

/**
 * Service Wave - Pont entre s_server et wave-api
 * Gere tous les appels vers wave-api
 */
class WaveService {
  private baseUrl: string
  private apiKey: string
  private managerId: string

  constructor() {
    this.baseUrl = isProd
      ? env.get('WAVE_API_URL') ?`http://${env.get('WAVE_API_URL')}:${env.get('WAVE_API_PORT')}` :'https://wallet.sublymus.com'
    : `http://${devIp}:${env.get('WAVE_API_PORT', '3333')}`

    this.apiKey = env.get('WAVE_API_KEY', '')
    this.managerId = env.get('WAVE_MANAGER_ID', '')

    if (!this.apiKey || !this.managerId) {
      logger.warn('WAVE_API_KEY or WAVE_MANAGER_ID not configured')
    }
  }

  /**
   * Headers communs pour toutes les requetes wave-api
   */
  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'X-Manager-Id': this.managerId,
    }
  }

  /**
   * Appel generique vers wave-api
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    endpoint: string,
    body?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    try {
      const response = await fetch(url, {
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000), // 15s timeout
      })

      const data = await response.json() as any

      if (!response.ok) {
        logger.error(
          {
            url,
            status: response.status,
            error: data
          },
          'Wave API error'
        )
        throw new Error(data.message || `Wave API error: ${response.status}`)
      }

      return data as T
    } catch (error: any) {
      logger.error(
        {
          url,
          error: error.message
        },
        'Failed to call Wave API'
      )
      throw error
    }
  }

  /**
   * Creer un wallet
   * Les types correspondent aux entity_type de wave-api:
   * - OWNER_MAIN → VENDOR (wallet principal du vendeur)
   * - STORE → VENDOR (wallet de la boutique)
   * - AFFILIATE_EARNINGS → VENDOR (wallet des gains d'affiliation)
   * - PLATFORM → PLATFORM (wallet plateforme)
   */
  async createWallet(payload: {
    owner_id: string
    owner_name?: string
    owner_wave_phone?: string
    entity_type: 'DRIVER' | 'VENDOR' | 'CLIENT' | 'PLATFORM'
    currency?: string
    overdraft_limit?: number
  }) {
    const response = await this.request<{
      id: string
      owner_id: string
      owner_name: string | null
      owner_wave_phone: string | null
      entity_type: string
      currency: string
      balance_accounting: number
      balance_available: number
      overdraft_limit: number
      is_locked: boolean
      manager_id: string
      created_at: string
      updated_at: string
    }>('POST', '/v1/wallets', {
      owner_id: payload.owner_id,
      owner_name: payload.owner_name,
      owner_wave_phone: payload.owner_wave_phone,
      entity_type: payload.entity_type,
      currency: payload.currency || 'XOF',
      overdraft_limit: payload.overdraft_limit || 0,
    })

    return response
  }

  /**
   * Recuperer les stats d'un wallet
   */
  async getWalletStats(walletId: string, params?: {
    start_date?: string
    end_date?: string
  }) {
    const queryParams = new URLSearchParams()
    if (params?.start_date) queryParams.append('start_date', params.start_date)
    if (params?.end_date) queryParams.append('end_date', params.end_date)

    const query = queryParams.toString() ? `?${queryParams.toString()}` : ''

    return this.request<{
      wallet: {
        id: string
        balance: number
        on_hold: number
        currency: string
        label: string
        type: string
      }
      transactions: {
        total_count: number
        total_volume: number
        by_category: Record<string, { count: number; volume: number }>
      }
    }>('GET', `/v1/wallets/${walletId}/stats${query}`)
  }

  /**
   * Recuperer le solde disponible d'un wallet
   * Utile pour verifier si l'utilisateur a assez de fonds avant paiement
   */
  async getWalletBalance(walletId: string) {
    return this.request<{
      wallet_id: string
      balance_accounting: number
      balance_available: number
      balance_on_hold: number
      currency: string
      overdraft_limit: number
      is_locked: boolean
    }>('GET', `/v1/wallets/${walletId}/balance`)
  }

  /**
   * Creer un PaymentIntent avec splits
   */
  async createPaymentIntent(payload: {
    external_reference: string
    amount: number
    currency?: string
    source_system: string
    success_url: string
    error_url: string
    splits: Array<{
      wallet_id: string
      amount: number
      category: string
      label: string
      external_reference?: string
      release_delay_hours?: number
      allow_early_release?: boolean
    }>
  }) {
    return this.request<{
      payment_intent_id: string
      wave_checkout_url: string
      status: string
    }>('POST', '/v1/checkout/complex', payload)
  }

  /**
   * Recuperer les details d'un PaymentIntent
   */
  async getPaymentIntent(paymentIntentId: string) {
    return this.request<{
      id: string
      status: string
      amount: number
      currency: string
      external_reference: string
      wave_checkout_url: string
      splits: any[]
    }>('GET', `/v1/checkout/${paymentIntentId}`)
  }

  /**
   * Transfert interne entre wallets
   */
  async internalTransfer(payload: {
    from_wallet_id: string
    to_wallet_id: string
    amount: number
    label: string
    category: 'ORDER_PAYMENT' | 'SERVICE_PAYMENT' | 'COMMISSION' | 'ADJUSTMENT' | 'SUBSCRIPTION'
    external_reference?: string
    source_system?: string
  }) {
    return this.request<{
      message: string
      data: {
        transaction_group_id: string
        from_wallet_id: string
        to_wallet_id: string
        amount: number
        category: string
        label: string
      }
    }>('POST', '/v1/transactions/transfer', payload)
  }

  /**
   * Release manuel d'une transaction ON_HOLD
   * Options:
   * - ledger_entry_id: Release d'une entree specifique
   * - external_reference: Release de toutes les entrees liees a cette reference
   * - external_reference + wallet_id: Release precis
   */
  async releaseTransaction(payload: {
    ledger_entry_id?: string
    external_reference?: string
    wallet_id?: string
  }) {
    return this.request<{
      message: string
      data: {
        entry_id: string
        wallet_id: string
        amount: number
        funds_status: string
      } | Array<{
        entry_id: string
        wallet_id: string
        amount: number
        funds_status: string
      }>
    }>('POST', '/v1/transactions/release', payload)
  }

  /**
   * Payout vers Wave (retrait)
   */
  async createPayout(payload: {
    wallet_id: string
    amount: number
    phone_number: string
    external_reference?: string
  }) {
    return this.request<{
      payout_id: string
      status: string
      amount: number
      fees: number
    }>('POST', '/v1/payouts', payload)
  }

  /**
   * Recuperer les transactions d'un wallet
   */
  async getWalletTransactions(
    walletId: string,
    params?: {
      start_date?: string
      end_date?: string
      category?: string
      limit?: number
      offset?: number
    }
  ) {
    const queryParams = new URLSearchParams()
    if (params?.start_date) queryParams.append('start_date', params.start_date)
    if (params?.end_date) queryParams.append('end_date', params.end_date)
    if (params?.category) queryParams.append('category', params.category)
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.offset) queryParams.append('offset', params.offset.toString())

    const query = queryParams.toString() ? `?${queryParams.toString()}` : ''

    return this.request<{
      transactions: Array<{
        id: string
        amount: number
        category: string
        label: string
        status: string
        created_at: string
      }>
      pagination: {
        total: number
        limit: number
        offset: number
      }
    }>('GET', `/v1/wallets/${walletId}/transactions${query}`)
  }
}

// Export singleton
export default new WaveService()
