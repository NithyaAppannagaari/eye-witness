import { ethers } from "hardhat";

async function main() {
  const usdc = await ethers.getContractAt("MockUSDC", process.env.NEXT_PUBLIC_USDC_ADDRESS!);
  const to = "0xAa02db622aB62C05bFF3aC50F1D725eb94523E46";
  const amount = ethers.parseUnits("1000", 6);
  const tx = await usdc.mint(to, amount);
  await tx.wait();
  console.log("Minted 1000 USDC →", to);
  console.log("Tx:", tx.hash);
  const bal = await usdc.balanceOf(to);
  console.log("Balance:", ethers.formatUnits(bal, 6), "USDC");
}

main().catch((e) => { console.error(e); process.exit(1); });
