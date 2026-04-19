import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

// Cut basis points — must sum to 10000
const PHOTOGRAPHER_CUT = 8_000n; // 80%
const AGENT_CUT = 1_000n;        // 10%
const PLATFORM_CUT = 1_000n;     // 10%

async function main() {
  const [deployer] = await ethers.getSigners();
  const agentAddress = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY!).address;
  const platformTreasury = process.env.PLATFORM_TREASURY_ADDRESS || deployer.address;

  console.log("Deploying Phase 3 with account:", deployer.address);
  console.log("Agent wallet:", agentAddress);
  console.log("Platform treasury:", platformTreasury);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // 1. MockUSDC
  const USDCFactory = await ethers.getContractFactory("MockUSDC");
  const usdc = await USDCFactory.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("\nMockUSDC deployed to:", usdcAddress);

  // 2. LicenseEngine
  const LEFactory = await ethers.getContractFactory("LicenseEngine");
  const licenseEngine = await LEFactory.deploy(
    PHOTOGRAPHER_CUT,
    AGENT_CUT,
    PLATFORM_CUT,
    platformTreasury,
    usdcAddress
  );
  await licenseEngine.waitForDeployment();
  const licenseEngineAddress = await licenseEngine.getAddress();
  console.log("LicenseEngine deployed to:", licenseEngineAddress);

  // 3. EscrowVault
  const VaultFactory = await ethers.getContractFactory("EscrowVault");
  const vault = await VaultFactory.deploy(licenseEngineAddress, usdcAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("EscrowVault deployed to:", vaultAddress);

  // 4. Grant EscrowVault AGENT_ROLE on LicenseEngine
  const AGENT_ROLE = await licenseEngine.AGENT_ROLE();
  await (await licenseEngine.grantRole(AGENT_ROLE, vaultAddress)).wait();
  console.log("\nGranted EscrowVault AGENT_ROLE on LicenseEngine");

  // 5. Grant agent wallet AGENT_ROLE on EscrowVault
  const VAULT_AGENT_ROLE = await vault.AGENT_ROLE();
  await (await vault.grantRole(VAULT_AGENT_ROLE, agentAddress)).wait();
  console.log("Granted agent wallet AGENT_ROLE on EscrowVault");

  // 6. Export ABIs to frontend
  const abiDir = path.resolve(__dirname, "../../frontend/src/abi");
  fs.mkdirSync(abiDir, { recursive: true });

  for (const [name, address] of [
    ["MockUSDC", usdcAddress],
    ["LicenseEngine", licenseEngineAddress],
    ["EscrowVault", vaultAddress],
  ] as const) {
    const artifact = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, `../artifacts/contracts/${name}.sol/${name}.json`),
        "utf8"
      )
    );
    fs.writeFileSync(
      path.join(abiDir, `${name}.json`),
      JSON.stringify({ address, abi: artifact.abi }, null, 2)
    );
    console.log(`ABI exported: frontend/src/abi/${name}.json`);
  }

  console.log("\n=== Add these to your .env ===");
  console.log(`NEXT_PUBLIC_USDC_ADDRESS=${usdcAddress}`);
  console.log(`NEXT_PUBLIC_LICENSE_ENGINE_ADDRESS=${licenseEngineAddress}`);
  console.log(`NEXT_PUBLIC_ESCROW_VAULT_ADDRESS=${vaultAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
