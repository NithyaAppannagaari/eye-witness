import { expect } from "chai";
import { ethers } from "hardhat";
import { LicenseEngine, MockUSDC } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("LicenseEngine", () => {
  let licenseEngine: LicenseEngine;
  let usdc: MockUSDC;
  let agent: HardhatEthersSigner;
  let photographer: HardhatEthersSigner;
  let publisher: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  // 80% photographer, 10% agent, 10% platform
  const PHOTOGRAPHER_CUT = 8_000n;
  const AGENT_CUT = 1_000n;
  const PLATFORM_CUT = 1_000n;
  const MINT_AMOUNT = ethers.parseUnits("10", 6); // 10 USDC
  const PHOTO_ID = ethers.keccak256(ethers.toUtf8Bytes("photo-1"));
  const PAGE_URL = "https://example.com/article";

  beforeEach(async () => {
    [, agent, photographer, publisher, treasury, other] = await ethers.getSigners();

    const USDCFactory = await ethers.getContractFactory("MockUSDC");
    usdc = await USDCFactory.deploy();

    const LEFactory = await ethers.getContractFactory("LicenseEngine");
    licenseEngine = await LEFactory.deploy(
      PHOTOGRAPHER_CUT,
      AGENT_CUT,
      PLATFORM_CUT,
      treasury.address,
      await usdc.getAddress()
    );

    // Grant agent AGENT_ROLE so it can call mintLicense directly in tests
    const AGENT_ROLE = await licenseEngine.AGENT_ROLE();
    await licenseEngine.grantRole(AGENT_ROLE, agent.address);

    // Mint USDC to agent so it can pre-fund mintLicense calls (simulating vault approval)
    await usdc.mint(agent.address, MINT_AMOUNT);
    // Agent approves licenseEngine to pull funds (simulating vault pre-approval)
    await usdc.connect(agent).approve(await licenseEngine.getAddress(), MINT_AMOUNT);
  });

  describe("constructor", () => {
    it("reverts if cuts do not sum to 10000", async () => {
      const Factory = await ethers.getContractFactory("LicenseEngine");
      await expect(
        Factory.deploy(5_000n, 1_000n, 1_000n, treasury.address, await usdc.getAddress())
      ).to.be.revertedWith("Cuts must sum to 10000");
    });
  });

  describe("mintLicense", () => {
    it("splits USDC correctly to photographer, agent, and treasury", async () => {
      const photographerBefore = await usdc.balanceOf(photographer.address);
      const agentBefore = await usdc.balanceOf(agent.address);
      const treasuryBefore = await usdc.balanceOf(treasury.address);

      await licenseEngine.connect(agent).mintLicense(
        PHOTO_ID, publisher.address, photographer.address, agent.address,
        "editorial", MINT_AMOUNT, PAGE_URL
      );

      const expectedPhotographer = (MINT_AMOUNT * PHOTOGRAPHER_CUT) / 10_000n;
      const expectedAgent = (MINT_AMOUNT * AGENT_CUT) / 10_000n;
      const expectedPlatform = MINT_AMOUNT - expectedPhotographer - expectedAgent;

      expect(await usdc.balanceOf(photographer.address)).to.equal(photographerBefore + expectedPhotographer);
      expect(await usdc.balanceOf(agent.address)).to.equal(agentBefore - MINT_AMOUNT + expectedAgent);
      expect(await usdc.balanceOf(treasury.address)).to.equal(treasuryBefore + expectedPlatform);
    });

    it("mints ERC-1155 token to publisher", async () => {
      await licenseEngine.connect(agent).mintLicense(
        PHOTO_ID, publisher.address, photographer.address, agent.address,
        "commercial", MINT_AMOUNT, PAGE_URL
      );
      const tokenId = BigInt(PHOTO_ID);
      expect(await licenseEngine.balanceOf(publisher.address, tokenId)).to.equal(1n);
    });

    it("emits LicenseMinted event", async () => {
      const tx = await licenseEngine.connect(agent).mintLicense(
        PHOTO_ID, publisher.address, photographer.address, agent.address,
        "editorial", MINT_AMOUNT, PAGE_URL
      );
      await expect(tx)
        .to.emit(licenseEngine, "LicenseMinted")
        .withArgs(PAGE_URL, PHOTO_ID, publisher.address, "editorial", await getBlockTimestamp((await tx.wait())!.blockNumber));
    });

    it("reverts when called without AGENT_ROLE", async () => {
      await expect(
        licenseEngine.connect(other).mintLicense(
          PHOTO_ID, publisher.address, photographer.address, agent.address,
          "editorial", MINT_AMOUNT, PAGE_URL
        )
      ).to.be.reverted;
    });

    it("can mint multiple licenses for the same photo to different publishers", async () => {
      await usdc.mint(agent.address, MINT_AMOUNT);
      await usdc.connect(agent).approve(await licenseEngine.getAddress(), MINT_AMOUNT * 2n);

      const PHOTO_ID_2 = ethers.keccak256(ethers.toUtf8Bytes("photo-2"));
      await licenseEngine.connect(agent).mintLicense(
        PHOTO_ID, publisher.address, photographer.address, agent.address,
        "editorial", MINT_AMOUNT, PAGE_URL
      );
      await licenseEngine.connect(agent).mintLicense(
        PHOTO_ID_2, other.address, photographer.address, agent.address,
        "commercial", MINT_AMOUNT, "https://other.com"
      );

      expect(await licenseEngine.balanceOf(publisher.address, BigInt(PHOTO_ID))).to.equal(1n);
      expect(await licenseEngine.balanceOf(other.address, BigInt(PHOTO_ID_2))).to.equal(1n);
    });
  });

  async function getBlockTimestamp(blockNumber: number): Promise<number> {
    return (await ethers.provider.getBlock(blockNumber))!.timestamp;
  }
});
