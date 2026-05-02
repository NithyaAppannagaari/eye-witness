// Redeploys LicenseEngine + EscrowVault with the CURRENT source. Fixes the
// case where the deployed engine was compiled from older source (e.g. with
// a 3-cut split) and disagrees with the local ABI / contract.
//
// Preserves PhotoRegistry and MockUSDC — your registered photos and any USDC
// balances in user wallets stay intact. Publisher escrow in the OLD vault
// will need to be withdrawn (the old vault still works) and re-deposited
// into the new vault.
//
// Usage:
//   npx hardhat run scripts/redeployEngineAndVault.ts --network <name>
//
// Required env:
//   NEXT_PUBLIC_USDC_ADDRESS    — existing MockUSDC (keep)
//   AGENT_WALLET_ADDRESS        — wallet that calls drawPayment

import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const ABI_DIR = path.resolve(__dirname, "../../frontend/src/abi");

function exportAbi(contractName: string, address: string) {
  const artifact = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, `../artifacts/contracts/${contractName}.sol/${contractName}.json`),
      "utf8"
    )
  );
  fs.mkdirSync(ABI_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(ABI_DIR, `${contractName}.json`),
    JSON.stringify({ address, abi: artifact.abi }, null, 2)
  );
  console.log(`ABI → frontend/src/abi/${contractName}.json (${address})`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS;
  const agentWallet = process.env.AGENT_WALLET_ADDRESS;
  if (!usdcAddress || !agentWallet) {
    throw new Error("Set NEXT_PUBLIC_USDC_ADDRESS and AGENT_WALLET_ADDRESS in .env");
  }

  // 1. New LicenseEngine with current 2-cut split (85% photographer / 15% platform)
  const platformTreasury = deployer.address;
  const LicenseEngine = await ethers.getContractFactory("LicenseEngine");
  const engine = await LicenseEngine.deploy(8500, 1500, platformTreasury, usdcAddress);
  await engine.waitForDeployment();
  const engineAddress = await engine.getAddress();
  console.log("New LicenseEngine:", engineAddress);
  exportAbi("LicenseEngine", engineAddress);

  // 2. New EscrowVault wired to the new engine
  const EscrowVault = await ethers.getContractFactory("EscrowVault");
  const vault = await EscrowVault.deploy(engineAddress, usdcAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("New EscrowVault:  ", vaultAddress);
  exportAbi("EscrowVault", vaultAddress);

  // 3. Grant roles
  const ENGINE_AGENT_ROLE = await engine.AGENT_ROLE();
  await (await engine.grantRole(ENGINE_AGENT_ROLE, vaultAddress)).wait();
  console.log("Granted LicenseEngine.AGENT_ROLE → new EscrowVault");

  const VAULT_AGENT_ROLE = await vault.AGENT_ROLE();
  await (await vault.grantRole(VAULT_AGENT_ROLE, agentWallet)).wait();
  console.log("Granted EscrowVault.AGENT_ROLE → agent wallet");

  console.log("\n=== Update .env and frontend/.env.local ===");
  console.log(`NEXT_PUBLIC_LICENSE_ENGINE_ADDRESS=${engineAddress}`);
  console.log(`NEXT_PUBLIC_ESCROW_VAULT_ADDRESS=${vaultAddress}`);

  console.log("\n=== After updating .env ===");
  console.log("1. Stop the agent.");
  console.log("2. (Optional) Wipe agent.db / agent.db-shm / agent.db-wal for a clean ledger.");
  console.log("3. Restart the agent — it will start indexing from the new vault's deploy block.");
  console.log("4. From the publisher wallet:");
  console.log("   a. (Optional) Withdraw your $5 from the OLD vault — still callable.");
  console.log("   b. Deposit USDC into the NEW vault.");
  console.log("   c. Call claimDomain('raw.githubusercontent.com') on the NEW vault.");
  console.log("5. Requeue the failed detection from the photographer dashboard.");
}

main().catch((err) => { console.error(err); process.exit(1); });
