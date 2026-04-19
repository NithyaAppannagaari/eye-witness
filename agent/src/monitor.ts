import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { ethers } from 'ethers'
import fs from 'fs'
import sgMail from '@sendgrid/mail'
import { logger } from './logger'

const ESCROW_ABI_PATH = path.resolve(__dirname, '../../frontend/src/abi/EscrowVault.json')

const MIN_STAKE_THRESHOLD = BigInt(process.env.MIN_STAKE_THRESHOLD ?? '10000000') // 10 USDC (6 decimals)
const MIN_GAS_THRESHOLD = BigInt(process.env.MIN_GAS_THRESHOLD ?? '5000000000000000') // 0.005 ETH
const POLL_INTERVAL_MS = 5 * 60_000

function getContracts() {
  const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL
  const fallbackUrl = process.env.FALLBACK_RPC_URL
  const escrowAddress = process.env.NEXT_PUBLIC_ESCROW_VAULT_ADDRESS
  if (!rpcUrl || !escrowAddress) throw new Error('Missing NEXT_PUBLIC_BASE_RPC_URL or NEXT_PUBLIC_ESCROW_VAULT_ADDRESS')

  const providers: ethers.JsonRpcProvider[] = [new ethers.JsonRpcProvider(rpcUrl)]
  if (fallbackUrl) providers.push(new ethers.JsonRpcProvider(fallbackUrl))
  const provider = providers.length > 1 ? new ethers.FallbackProvider(providers) : providers[0]

  const escrowAbi = JSON.parse(fs.readFileSync(ESCROW_ABI_PATH, 'utf-8')).abi
  const escrowVault = new ethers.Contract(escrowAddress, escrowAbi, provider)
  return { provider, escrowVault }
}

async function sendAlert(subject: string, body: string): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  const alertEmail = process.env.ALERT_EMAIL ?? fromEmail

  if (!apiKey || !fromEmail || !alertEmail) {
    logger.warn('[monitor] Alert suppressed — SENDGRID_API_KEY / SENDGRID_FROM_EMAIL / ALERT_EMAIL not set')
    logger.warn(`[monitor] ALERT: ${subject} — ${body}`)
    return
  }
  sgMail.setApiKey(apiKey)
  await sgMail.send({ to: alertEmail, from: fromEmail, subject, text: body })
  logger.info({ subject }, '[monitor] Alert sent')
}

async function checkStake(): Promise<void> {
  const agencyWallet = process.env.AGENT_WALLET_ADDRESS
  if (!agencyWallet) return

  try {
    const { escrowVault } = getContracts()
    const stake = await escrowVault.agencyStakes(agencyWallet) as bigint
    if (stake < MIN_STAKE_THRESHOLD) {
      await sendAlert(
        '[Eye:Witness] Low Agency Stake',
        `Agency stake for ${agencyWallet} is ${stake.toString()} USDC (min: ${MIN_STAKE_THRESHOLD.toString()}). Please replenish.`
      )
    }
    logger.info({ stake: stake.toString() }, '[monitor] Stake OK')
  } catch (err) {
    logger.error({ err }, '[monitor] Failed to check stake')
  }
}

async function checkGas(): Promise<void> {
  const agentWallet = process.env.AGENT_WALLET_ADDRESS
  if (!agentWallet) return

  try {
    const { provider } = getContracts()
    const balance = await provider.getBalance(agentWallet)
    if (balance < MIN_GAS_THRESHOLD) {
      await sendAlert(
        '[Eye:Witness] Low Agent Gas Balance',
        `Agent wallet ${agentWallet} ETH balance is ${ethers.formatEther(balance)} ETH (min: ${ethers.formatEther(MIN_GAS_THRESHOLD)} ETH). Please fund the wallet.`
      )
    }
    logger.info({ balance: ethers.formatEther(balance) }, '[monitor] Gas OK')
  } catch (err) {
    logger.error({ err }, '[monitor] Failed to check gas balance')
  }
}

export function startMonitor(): void {
  const poll = async () => {
    await checkStake()
    await checkGas()
  }
  poll()
  setInterval(poll, POLL_INTERVAL_MS)
  logger.info('[monitor] Started — polling every 5 minutes')
}

// Run as standalone script
if (require.main === module) {
  startMonitor()
}
