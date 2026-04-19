import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { ethers } from 'ethers'
import fs from 'fs'

const ABI_PATH = path.resolve(__dirname, '../../frontend/src/abi/DisputeRegistry.json')

let _contract: ethers.Contract | null = null

function getContract(): ethers.Contract {
  if (_contract) return _contract

  const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL
  const address = process.env.NEXT_PUBLIC_DISPUTE_REGISTRY_ADDRESS
  const agentKey = process.env.AGENT_PRIVATE_KEY

  if (!rpcUrl || !address || !agentKey) {
    throw new Error('Missing env: NEXT_PUBLIC_BASE_RPC_URL, NEXT_PUBLIC_DISPUTE_REGISTRY_ADDRESS, AGENT_PRIVATE_KEY')
  }

  const abiJson = JSON.parse(fs.readFileSync(ABI_PATH, 'utf-8'))
  const abi = abiJson.abi ?? abiJson
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(agentKey, provider)
  _contract = new ethers.Contract(address, abi, wallet)
  return _contract
}

export async function logDisputeOnChain(
  photoHash: string,
  pageUrl: string,
  imageUrl: string
): Promise<number> {
  const contract = getContract()
  const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes(`${imageUrl}|${pageUrl}`))
  const tx = await contract.logDispute(photoHash, pageUrl, evidenceHash)
  const receipt = await tx.wait() as ethers.TransactionReceipt

  const event = receipt.logs
    .map(log => { try { return contract.interface.parseLog(log) } catch { return null } })
    .find(e => e?.name === 'DisputeLogged')

  if (!event) throw new Error('DisputeLogged event not found in receipt')
  return Number(event.args.disputeId)
}

export async function resolveDisputeOnChain(disputeId: number): Promise<void> {
  const contract = getContract()
  const tx = await contract.resolveDispute(disputeId)
  await tx.wait()
  console.log(`[dispute] Resolved disputeId ${disputeId} on-chain`)
}
