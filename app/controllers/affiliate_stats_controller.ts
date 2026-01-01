import type { HttpContext } from '@adonisjs/core/http'
import StoreSubscription from '#models/store_subscription'
import AffiliateCode from '#models/affiliate_code'
import { DateTime } from 'luxon'
import affiliateConfig from '#config/affiliate'

export default class AffiliateStatsController {
  /**
   * GET /api/affiliate-stats/revenue-history
   * Historique des revenus avec filtres optionnels
   */
  async revenueHistory({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()

    // Query params
    const code = request.input('code') // Filtrer par code spécifique
    const channel = request.input('channel') // Filtrer par channel
    const startDate = request.input('start_date') // Date début (YYYY-MM-DD)
    const endDate = request.input('end_date') // Date fin (YYYY-MM-DD)

    // Query de base : subscriptions de l'utilisateur avec affiliate
    let query = StoreSubscription.query()
      .where('affiliate_user_id', user.id)
      .whereNotNull('amount_paid')
      .orderBy('created_at', 'desc')

    // Filtre par code
    if (code) {
      query = query.where('affiliate_code', code.toUpperCase())
    }

    // Filtre par date
    if (startDate) {
      const start = DateTime.fromISO(startDate).startOf('day')
      query = query.where('created_at', '>=', start.toSQL()||'')
    }

    if (endDate) {
      const end = DateTime.fromISO(endDate).endOf('day')
      query = query.where('created_at', '<=', end.toSQL()||'')
    }

    // Filtre par channel : nécessite JOIN avec affiliate_codes
    if (channel) {
      query = query
        .join('affiliate_codes', 'store_subscriptions.affiliate_code', 'affiliate_codes.code')
        .where('affiliate_codes.channel', channel)
    }

    const subscriptions = await query.preload('store').preload('plan')

    // Calculer les commissions (20% du amount_paid)
    const history = subscriptions.map((sub) => {
      const commission = sub.amount_paid ? Math.round(sub.amount_paid * 0.2) : 0

      return {
        subscription_id: sub.id,
        store_id: sub.store_id,
        store_name: sub.store?.name || 'N/A',
        plan_name: sub.plan?.name || 'N/A',
        affiliate_code: sub.affiliate_code,
        amount_paid: sub.amount_paid,
        commission: commission,
        duration_months: sub.duration_months,
        created_at: sub.createdAt,
        is_affiliate_active: sub.isAffiliateActive,
      }
    })

    return response.ok({
      total_records: history.length,
      total_commission: history.reduce((sum, item) => sum + item.commission, 0),
      filters: {
        code: code || 'all',
        channel: channel || 'all',
        start_date: startDate || 'all',
        end_date: endDate || 'all',
      },
      history,
    })
  }

  /**
   * GET /api/affiliate-stats/revenue-chart
   * Données pour graphique de revenus par période
   */
  async revenueChart({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()

    // Query params
    const period = request.input('period', '30d') // 7d, 15d, 30d
    const channel = request.input('channel') // Filtrer par channel

    // Calculer la date de début selon la période
    const now = DateTime.now()
    let startDate: DateTime

    switch (period) {
      case '7d':
        startDate = now.minus({ days: 7 })
        break
      case '15d':
        startDate = now.minus({ days: 15 })
        break
      case '30d':
      default:
        startDate = now.minus({ days: 30 })
        break
    }

    // Query de base
    let query = StoreSubscription.query()
      .where('affiliate_user_id', user.id)
      .whereNotNull('amount_paid')
      .where('created_at', '>=', startDate.toSQL()||'')
      .orderBy('created_at', 'asc')

    // Filtre par channel
    if (channel) {
      query = query
        .join('affiliate_codes', 'store_subscriptions.affiliate_code', 'affiliate_codes.code')
        .where('affiliate_codes.channel', channel)
    }

    const subscriptions = await query

    // Grouper par jour
    const dataByDay: Record<string, number> = {}

    subscriptions.forEach((sub) => {
      const day = sub.createdAt.toISODate()||'' // Format YYYY-MM-DD
      const commission = sub.amount_paid ? Math.round(sub.amount_paid * 0.2) : 0

      if (!dataByDay[day]) {
        dataByDay[day] = 0
      }
      dataByDay[day] += commission
    })

    // Convertir en array de points pour le graphique
    const chartData = Object.entries(dataByDay).map(([date, revenue]) => ({
      date,
      revenue,
    }))

    return response.ok({
      period,
      channel: channel || 'all',
      start_date: startDate.toISODate(),
      end_date: now.toISODate(),
      total_revenue: chartData.reduce((sum, item) => sum + item.revenue, 0),
      data: chartData,
    })
  }

  /**
   * GET /api/affiliate-stats/my-kpis
   * KPIs du parrain avec détails par channel et/ou code
   */
  async myKpis({ request, response, auth }: HttpContext) {
    const user = await auth.authenticate()

    // Query params
    const withChannel = request.input('with_channel', 'false') === 'true'
    const withCode = request.input('with_code', 'false') === 'true'

    // Récupérer toutes les subscriptions affiliées
    const subscriptions = await StoreSubscription.query()
      .where('affiliate_user_id', user.id)
      .whereNotNull('affiliate_code')

    // Calcul des KPIs globaux
    const totalReferrals = subscriptions.length
    const activeReferrals = subscriptions.filter((sub) => sub.isAffiliateActive).length
    const totalRevenue = subscriptions.reduce((sum, sub) => {
      const commission = sub.amount_paid ? Math.round(sub.amount_paid * 0.2) : 0
      return sum + commission
    }, 0)

    const result: any = {
      total_referrals: totalReferrals,
      active_referrals: activeReferrals,
      total_revenue: totalRevenue,
    }

    // Détails par channel
    if (withChannel) {
      // Récupérer les codes avec leur channel
      const codes = await AffiliateCode.query().where('user_id', user.id)

      // Map code → channel
      const codeToChannel: Record<string, string | null> = {}
      codes.forEach((code) => {
        codeToChannel[code.code] = code.channel
      })

      // Grouper par channel
      const byChannel: Record<
        string,
        { referrals: number; active_referrals: number; revenue: number }
      > = {}

      subscriptions.forEach((sub) => {
        const channelName =
          codeToChannel[sub.affiliate_code!] || affiliateConfig.genericChannelLabel
        const commission = sub.amount_paid ? Math.round(sub.amount_paid * 0.2) : 0

        if (!byChannel[channelName]) {
          byChannel[channelName] = { referrals: 0, active_referrals: 0, revenue: 0 }
        }

        byChannel[channelName].referrals++
        if (sub.isAffiliateActive) {
          byChannel[channelName].active_referrals++
        }
        byChannel[channelName].revenue += commission
      })

      result.by_channel = byChannel
    }

    // Détails par code
    if (withCode) {
      const byCode: Record<
        string,
        { referrals: number; active_referrals: number; revenue: number }
      > = {}

      subscriptions.forEach((sub) => {
        const code = sub.affiliate_code!
        const commission = sub.amount_paid ? Math.round(sub.amount_paid * 0.2) : 0

        if (!byCode[code]) {
          byCode[code] = { referrals: 0, active_referrals: 0, revenue: 0 }
        }

        byCode[code].referrals++
        if (sub.isAffiliateActive) {
          byCode[code].active_referrals++
        }
        byCode[code].revenue += commission
      })

      result.by_code = byCode
    }

    return response.ok(result)
  }
}
