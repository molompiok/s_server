// app/services/payments/event_handler.ts
import vine from '@vinejs/vine'
import logger from '@adonisjs/core/services/logger'
import waveService from '#services/payments/wave'

/**
 * Service de gestion des evenements de paiement
 * Valide les donnees et delegue les appels a wave-api
 * Empeche s_api de manipuler directement WAVE_API_KEY
 */

/**
 * Types d'evenements supportes
 */
export type PaymentEventType =
  | 'wallet.create'
  | 'payment.intent.create'
  | 'transaction.transfer'
  | 'transaction.release'
  | 'payout.create'

/**
 * Schema de validation pour wallet.create
 */
const walletCreateSchema = vine.compile(
  vine.object({
    event: vine.literal('wallet.create'),
    data: vine.object({
      owner_id: vine.string(),
      owner_name: vine.string().optional(),
      owner_wave_phone: vine.string().optional(),
      entity_type: vine.enum(['DRIVER', 'VENDOR', 'CLIENT', 'PLATFORM'] as const),
      currency: vine.string().fixedLength(3).optional(),
      overdraft_limit: vine.number().withoutDecimals().min(0).optional(),
    }),
  })
)

/**
 * Schema de validation pour payment.intent.create
 */
const paymentIntentCreateSchema = vine.compile(
  vine.object({
    event: vine.literal('payment.intent.create'),
    data: vine.object({
      external_reference: vine.string(),
      amount: vine.number().withoutDecimals().min(1),
      currency: vine.string().fixedLength(3).optional(),
      source_system: vine.string(),
      success_url: vine.string().url(),
      error_url: vine.string().url(),
      splits: vine
        .array(
          vine.object({
            wallet_id: vine.string(),
            amount: vine.number().withoutDecimals().min(1),
            category: vine.string(),
            label: vine.string(),
            external_reference: vine.string().optional(),
            release_delay_hours: vine.number().min(0).optional(),
            allow_early_release: vine.boolean().optional(),
          })
        )
        .minLength(1),
    }),
  })
)

/**
 * Schema de validation pour transaction.transfer
 */
const transactionTransferSchema = vine.compile(
  vine.object({
    event: vine.literal('transaction.transfer'),
    data: vine.object({
      from_wallet_id: vine.string(),
      to_wallet_id: vine.string(),
      amount: vine.number().withoutDecimals().min(1),
      label: vine.string(),
      category: vine.enum([
        'ORDER_PAYMENT',
        'SERVICE_PAYMENT',
        'COMMISSION',
        'ADJUSTMENT',
        'SUBSCRIPTION',
      ] as const),
      external_reference: vine.string().optional(),
      source_system: vine.string().optional(),
    }),
  })
)

/**
 * Schema de validation pour transaction.release
 */
const transactionReleaseSchema = vine.compile(
  vine.object({
    event: vine.literal('transaction.release'),
    data: vine.object({
      ledger_entry_id: vine.string().optional(),
      external_reference: vine.string().optional(),
      wallet_id: vine.string().optional(),
    }),
  })
)

/**
 * Schema de validation pour payout.create
 */
const payoutCreateSchema = vine.compile(
  vine.object({
    event: vine.literal('payout.create'),
    data: vine.object({
      wallet_id: vine.string(),
      amount: vine.number().withoutDecimals().min(1),
      phone_number: vine.string(),
      external_reference: vine.string().optional(),
    }),
  })
)

/**
 * Handler principal des evenements de paiement
 */
class PaymentEventHandler {
  /**
   * Traite un evenement de paiement
   * Valide les donnees et delegue a la methode appropriee
   */
  async handle(event: { event: PaymentEventType; data: any }): Promise<any> {
    logger.info({ event: event.event }, 'Processing payment event')

    try {
      switch (event.event) {
        case 'wallet.create':
          return await this.handleWalletCreate(event)

        case 'payment.intent.create':
          return await this.handlePaymentIntentCreate(event)

        case 'transaction.transfer':
          return await this.handleTransactionTransfer(event)

        case 'transaction.release':
          return await this.handleTransactionRelease(event)

        case 'payout.create':
          return await this.handlePayoutCreate(event)

        default:
          throw new Error(`Unknown event type: ${event.event}`)
      }
    } catch (error: any) {
      logger.error(
        {
          event: event.event,
          error: error.message,
          stack: error.stack,
        },
        'Payment event handling failed'
      )
      throw error
    }
  }

  /**
   * Cree un wallet via wave-api
   */
  private async handleWalletCreate(event: any) {
    const validated = await walletCreateSchema.validate(event)

    logger.info(
      {
        owner_id: validated.data.owner_id,
        entity_type: validated.data.entity_type,
      },
      'Creating wallet'
    )

    const wallet = await waveService.createWallet(validated.data)

    logger.info({ wallet_id: wallet.id, owner_id: validated.data.owner_id }, 'Wallet created')

    return wallet
  }

  /**
   * Cree un payment intent via wave-api
   */
  private async handlePaymentIntentCreate(event: any) {
    const validated = await paymentIntentCreateSchema.validate(event)

    logger.info(
      {
        external_reference: validated.data.external_reference,
        amount: validated.data.amount,
        splits_count: validated.data.splits.length,
      },
      'Creating payment intent'
    )

    const intent = await waveService.createPaymentIntent({
      ...validated.data,
      currency: validated.data.currency || 'XOF',
    })

    logger.info(
      {
        payment_intent_id: intent.payment_intent_id,
        external_reference: validated.data.external_reference,
      },
      'Payment intent created'
    )

    return intent
  }

  /**
   * Effectue un transfert interne via wave-api
   */
  private async handleTransactionTransfer(event: any) {
    const validated = await transactionTransferSchema.validate(event)

    logger.info(
      {
        from_wallet_id: validated.data.from_wallet_id,
        to_wallet_id: validated.data.to_wallet_id,
        amount: validated.data.amount,
        category: validated.data.category,
      },
      'Processing internal transfer'
    )

    const result = await waveService.internalTransfer(validated.data)

    logger.info(
      {
        transaction_group_id: result.data.transaction_group_id,
      },
      'Transfer completed'
    )

    return result
  }

  /**
   * Release une transaction ON_HOLD via wave-api
   */
  private async handleTransactionRelease(event: any) {
    const validated = await transactionReleaseSchema.validate(event)

    // Validation: au moins un identifiant requis
    if (
      !validated.data.ledger_entry_id &&
      !validated.data.external_reference
    ) {
      throw new Error('ledger_entry_id or external_reference required')
    }

    logger.info(
      {
        ledger_entry_id: validated.data.ledger_entry_id,
        external_reference: validated.data.external_reference,
        wallet_id: validated.data.wallet_id,
      },
      'Releasing transaction'
    )

    const result = await waveService.releaseTransaction(validated.data)

    logger.info('Transaction released')

    return result
  }

  /**
   * Cree un payout (retrait) via wave-api
   */
  private async handlePayoutCreate(event: any) {
    const validated = await payoutCreateSchema.validate(event)

    logger.info(
      {
        wallet_id: validated.data.wallet_id,
        amount: validated.data.amount,
        phone_number: validated.data.phone_number,
      },
      'Creating payout'
    )

    const result = await waveService.createPayout(validated.data)

    logger.info(
      {
        payout_id: result.payout_id,
      },
      'Payout created'
    )

    return result
  }
}

export default new PaymentEventHandler()
