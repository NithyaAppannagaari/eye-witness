import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { ethers } from 'ethers'
import fs from 'fs'

const ESCROW_ABI_PATH = path.resolve(__dirname, '../../frontend/src/abi/EscrowVault.json')
const REGISTRY_ABI_PATH = path.resolve(__dirname, '../../frontend/src/abi/PhotoRegistry.json')

let _wallet: ethers.Wallet | null = null
let _escrowVault: ethers.Contract | null = null
let _photoRegistry: ethers.Contract | null = null

function getContracts() {
  if (_wallet && _escrowVault && _photoRegistry) {
    return { wallet: _wallet, escrowVault: _escrowVault, photoRegistry: _photoRegistry }
  }

  const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL
  const escrowAddress = process.env.NEXT_PUBLIC_ESCROW_VAULT_ADDRESS
  const registryAddress = process.env.NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS
  const agentKey = process.env.AGENT_PRIVATE_KEY

  if (!rpcUrl || !escrowAddress || !registryAddress || !agentKey) {
    throw new Error('Missing env vars: NEXT_PUBLIC_BASE_RPC_URL, NEXT_PUBLIC_ESCROW_VAULT_ADDRESS, NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS, AGENT_PRIVATE_KEY')
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  _wallet = new ethers.Wallet(agentKey, provider)

  const escrowAbi = JSON.parse(fs.readFileSync(ESCROW_ABI_PATH, 'utf-8')).abi
  const registryAbi = JSON.parse(fs.readFileSync(REGISTRY_ABI_PATH, 'utf-8')).abi

  _escrowVault = new ethers.Contract(escrowAddress, escrowAbi, _wallet)
  _photoRegistry = new ethers.Contract(registryAddress, registryAbi, _wallet)

  return { wallet: _wallet, escrowVault: _escrowVault, photoRegistry: _photoRegistry }
}

export async function getPublisherForDomain(domain: string): Promise<string | null> {
  const { escrowVault } = getContracts()
  const owner = await escrowVault.domainOwners(domain) as string
  if (!owner || owner === ethers.ZeroAddress) return null
  return owner
}

export async function getPublisherBalance(publisherAddress: string): Promise<bigint> {
  const { escrowVault } = getContracts()
  return await escrowVault.getBalance(publisherAddress) as bigint
}

// Reads the on-chain idempotency guard. Used by the boot-time reconciler to decide
// whether a 'paying' row was actually charged before the agent crashed.
export async function isAlreadyChargedOnChain(photoId: string, pageUrl: string): Promise<boolean> {
  const { escrowVault } = getContracts()
  return await escrowVault.chargedFor(photoId, pageUrl) as boolean
}

export async function executePayment(
  publisherAddress: string,
  photoHash: string,
  amount: bigint,
  pageUrl: string,
  photographer: string,
  useType: string
): Promise<string> {
  const { escrowVault, photoRegistry } = getContracts()

  const tx = await escrowVault.drawPayment(
    publisherAddress,
    amount,
    photoHash,
    pageUrl,
    photographer,
    useType
  )
  const receipt = await tx.wait() as ethers.TransactionReceipt

  // Record license in PhotoRegistry — no access control, anyone can call
  try {
    const regTx = await photoRegistry.recordLicense(photoHash, pageUrl)
    await regTx.wait()
  } catch (err) {
    console.warn('[payment] recordLicense failed (non-fatal):', err)
  }

  return receipt.hash
}
