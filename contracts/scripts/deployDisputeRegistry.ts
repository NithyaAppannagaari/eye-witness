import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying DisputeRegistry with account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const Factory = await ethers.getContractFactory("DisputeRegistry");
  const registry = await Factory.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("DisputeRegistry deployed to:", address);

  // Grant AGENT_ROLE to the agent wallet
  const agentAddress = process.env.AGENT_WALLET_ADDRESS;
  if (agentAddress) {
    const AGENT_ROLE = await registry.AGENT_ROLE();
    await registry.grantRole(AGENT_ROLE, agentAddress);
    console.log("AGENT_ROLE granted to:", agentAddress);
  } else {
    console.warn("AGENT_WALLET_ADDRESS not set — grant AGENT_ROLE manually");
  }

  // Export ABI to frontend
  const artifact = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../artifacts/contracts/DisputeRegistry.sol/DisputeRegistry.json"),
      "utf8"
    )
  );

  const abiDir = path.resolve(__dirname, "../../frontend/src/abi");
  fs.mkdirSync(abiDir, { recursive: true });
  fs.writeFileSync(
    path.join(abiDir, "DisputeRegistry.json"),
    JSON.stringify({ address, abi: artifact.abi }, null, 2)
  );
  console.log("ABI exported to frontend/src/abi/DisputeRegistry.json");
  console.log("\nAdd to .env:");
  console.log(`NEXT_PUBLIC_DISPUTE_REGISTRY_ADDRESS=${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
