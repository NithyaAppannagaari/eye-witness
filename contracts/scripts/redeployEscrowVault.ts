// Redeploys ONLY the EscrowVault (now with the chargedFor idempotency guard)
// and rewires the role grants. PhotoRegistry, LicenseEngine, and MockUSDC are
// untouched so existing photo registrations and USDC balances persist.
//
// Run:  npx hardhat run scripts/redeployEscrowVault.ts --network <name>
//
// Required env vars:
//   NEXT_PUBLIC_LICENSE_ENGINE_ADDRESS  — existing LicenseEngine
//   NEXT_PUBLIC_USDC_ADDRESS            — existing MockUSDC (or real USDC)
//   AGENT_WALLET_ADDRESS                — wallet the agent uses to call drawPayment
//   NEXT_PUBLIC_ESCROW_VAULT_ADDRESS    — (optional) old vault, to revoke its role

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
  console.log(`ABI exported → frontend/src/abi/${contractName}.json (address: ${address})`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const engineAddress = process.env.NEXT_PUBLIC_LICENSE_ENGINE_ADDRESS;
  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS;
  const agentWallet = process.env.AGENT_WALLET_ADDRESS;
  const oldVaultAddress = process.env.NEXT_PUBLIC_ESCROW_VAULT_ADDRESS;

  if (!engineAddress || !usdcAddress || !agentWallet) {
    throw new Error("Set NEXT_PUBLIC_LICENSE_ENGINE_ADDRESS, NEXT_PUBLIC_USDC_ADDRESS, AGENT_WALLET_ADDRESS in .env");
  }

  // 1. Deploy new vault
  const EscrowVault = await ethers.getContractFactory("EscrowVault");
  const vault = await EscrowVault.deploy(engineAddress, usdcAddress);
  await vault.waitForDeployment();
  const newVaultAddress = await vault.getAddress();
  console.log("New EscrowVault:", newVaultAddress);
  exportAbi("EscrowVault", newVaultAddress);

  // 2. Grant LicenseEngine.AGENT_ROLE to the new vault so it can call mintLicense
  const LicenseEngine = await ethers.getContractFactory("LicenseEngine");
  const engine = LicenseEngine.attach(engineAddress);
  const LE_AGENT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("AGENT_ROLE"));
  await (await engine.grantRole(LE_AGENT_ROLE, newVaultAddress)).wait();
  console.log("Granted LicenseEngine.AGENT_ROLE → new EscrowVault");

  // 3. Revoke the old vault's role (defensive — leftover role on a stale contract is harmless but messy)
  if (oldVaultAddress && oldVaultAddress !== newVaultAddress) {
    try {
      await (await engine.revokeRole(LE_AGENT_ROLE, oldVaultAddress)).wait();
      console.log("Revoked LicenseEngine.AGENT_ROLE from old EscrowVault:", oldVaultAddress);
    } catch (err) {
      console.warn("Could not revoke old role (may not exist or no admin permission):", err);
    }
  }

  // 4. Grant the agent wallet AGENT_ROLE on the new vault
  const VAULT_AGENT_ROLE = await vault.AGENT_ROLE();
  await (await vault.grantRole(VAULT_AGENT_ROLE, agentWallet)).wait();
  console.log("Granted EscrowVault.AGENT_ROLE → agent wallet:", agentWallet);

  console.log("\n--- Update these in .env and frontend/.env.local ---");
  console.log(`NEXT_PUBLIC_ESCROW_VAULT_ADDRESS=${newVaultAddress}`);
  console.log("\n--- Next steps ---");
  console.log("1. Restart the agent so it loads the new vault address");
  console.log("2. Publishers must re-deposit USDC into the new vault (old balances stay in old vault)");
  console.log("3. Withdraw stuck balances from old vault if needed: oldVault.withdraw(amount) from publisher wallet");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
