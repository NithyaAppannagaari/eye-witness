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
  console.log(`ABI exported → frontend/src/abi/${contractName}.json`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // 1. MockUSDC
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC:", usdcAddress);
  exportAbi("MockUSDC", usdcAddress);

  // 2. PhotoRegistry
  const PhotoRegistry = await ethers.getContractFactory("PhotoRegistry");
  const registry = await PhotoRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("PhotoRegistry:", registryAddress);
  exportAbi("PhotoRegistry", registryAddress);

  // 3. LicenseEngine (85% photographer, 15% platform)
  const platformTreasury = deployer.address;
  const LicenseEngine = await ethers.getContractFactory("LicenseEngine");
  const engine = await LicenseEngine.deploy(8500, 1500, platformTreasury, usdcAddress);
  await engine.waitForDeployment();
  const engineAddress = await engine.getAddress();
  console.log("LicenseEngine:", engineAddress);
  exportAbi("LicenseEngine", engineAddress);

  // 4. EscrowVault
  const EscrowVault = await ethers.getContractFactory("EscrowVault");
  const vault = await EscrowVault.deploy(engineAddress, usdcAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("EscrowVault:", vaultAddress);
  exportAbi("EscrowVault", vaultAddress);

  // 5. Grant roles: EscrowVault gets AGENT_ROLE on LicenseEngine
  //                Agent wallet gets AGENT_ROLE on EscrowVault
  const AGENT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("AGENT_ROLE"));
  await (await engine.grantRole(AGENT_ROLE, vaultAddress)).wait();
  console.log("Granted LicenseEngine.AGENT_ROLE → EscrowVault");

  const agentWallet = process.env.AGENT_WALLET_ADDRESS;
  if (agentWallet) {
    await (await vault.grantRole(AGENT_ROLE, agentWallet)).wait();
    console.log("Granted EscrowVault.AGENT_ROLE →", agentWallet);
  } else {
    console.log("AGENT_WALLET_ADDRESS not set — grant EscrowVault.AGENT_ROLE manually");
  }

  console.log("\n--- Add to .env and frontend/.env.local ---");
  console.log(`NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`NEXT_PUBLIC_LICENSE_ENGINE_ADDRESS=${engineAddress}`);
  console.log(`NEXT_PUBLIC_ESCROW_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`NEXT_PUBLIC_USDC_ADDRESS=${usdcAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
