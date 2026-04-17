import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const Factory = await ethers.getContractFactory("PhotoRegistry");
  const registry = await Factory.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("PhotoRegistry deployed to:", address);

  // Export ABI to frontend
  const artifact = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../artifacts/contracts/PhotoRegistry.sol/PhotoRegistry.json"),
      "utf8"
    )
  );

  const abiDir = path.resolve(__dirname, "../../frontend/src/abi");
  fs.mkdirSync(abiDir, { recursive: true });
  fs.writeFileSync(
    path.join(abiDir, "PhotoRegistry.json"),
    JSON.stringify({ address, abi: artifact.abi }, null, 2)
  );
  console.log("ABI exported to frontend/src/abi/PhotoRegistry.json");

  // Print .env update instruction
  console.log("\nAdd this to your .env:");
  console.log(`NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS=${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
