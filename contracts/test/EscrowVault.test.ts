import { expect } from "chai";
import { ethers } from "hardhat";
import { EscrowVault, LicenseEngine, MockUSDC } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("EscrowVault", () => {
  let vault: EscrowVault;
  let licenseEngine: LicenseEngine;
  let usdc: MockUSDC;
  let deployer: HardhatEthersSigner;
  let agent: HardhatEthersSigner;
  let photographer: HardhatEthersSigner;
  let publisher: HardhatEthersSigner;
  let agency: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  const DEPOSIT_AMOUNT = ethers.parseUnits("100", 6);
  const PRICE = ethers.parseUnits("10", 6);
  const PHOTO_ID = ethers.keccak256(ethers.toUtf8Bytes("photo-1"));
  const PAGE_URL = "https://example.com/article";

  beforeEach(async () => {
    [deployer, agent, photographer, publisher, agency, treasury, other] = await ethers.getSigners();

    const USDCFactory = await ethers.getContractFactory("MockUSDC");
    usdc = await USDCFactory.deploy();

    const LEFactory = await ethers.getContractFactory("LicenseEngine");
    licenseEngine = await LEFactory.deploy(8_000n, 1_000n, 1_000n, treasury.address, await usdc.getAddress());

    const VaultFactory = await ethers.getContractFactory("EscrowVault");
    vault = await VaultFactory.deploy(await licenseEngine.getAddress(), await usdc.getAddress());

    // Grant vault AGENT_ROLE on LicenseEngine
    const LE_AGENT_ROLE = await licenseEngine.AGENT_ROLE();
    await licenseEngine.grantRole(LE_AGENT_ROLE, await vault.getAddress());

    // Grant agent AGENT_ROLE on vault
    const VAULT_AGENT_ROLE = await vault.AGENT_ROLE();
    await vault.grantRole(VAULT_AGENT_ROLE, agent.address);

    // Fund publisher with USDC
    await usdc.mint(publisher.address, DEPOSIT_AMOUNT);
    await usdc.connect(publisher).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
  });

  describe("deposit / withdraw", () => {
    it("records publisher balance after deposit", async () => {
      await vault.connect(publisher).deposit(DEPOSIT_AMOUNT);
      expect(await vault.getBalance(publisher.address)).to.equal(DEPOSIT_AMOUNT);
    });

    it("emits Deposited event", async () => {
      await expect(vault.connect(publisher).deposit(DEPOSIT_AMOUNT))
        .to.emit(vault, "Deposited")
        .withArgs(publisher.address, DEPOSIT_AMOUNT);
    });

    it("reduces balance on withdraw", async () => {
      await vault.connect(publisher).deposit(DEPOSIT_AMOUNT);
      await vault.connect(publisher).withdraw(PRICE);
      expect(await vault.getBalance(publisher.address)).to.equal(DEPOSIT_AMOUNT - PRICE);
    });

    it("reverts withdraw when balance insufficient", async () => {
      await expect(vault.connect(publisher).withdraw(PRICE)).to.be.revertedWith("Insufficient balance");
    });
  });

  describe("drawPayment", () => {
    beforeEach(async () => {
      await vault.connect(publisher).deposit(DEPOSIT_AMOUNT);
    });

    it("deducts publisher balance and distributes USDC correctly", async () => {
      const photographerBefore = await usdc.balanceOf(photographer.address);
      const agentBefore = await usdc.balanceOf(agent.address);
      const treasuryBefore = await usdc.balanceOf(treasury.address);

      await vault.connect(agent).drawPayment(
        publisher.address, PRICE, PHOTO_ID, PAGE_URL, photographer.address, "editorial"
      );

      expect(await vault.getBalance(publisher.address)).to.equal(DEPOSIT_AMOUNT - PRICE);

      const expectedPhotographer = (PRICE * 8_000n) / 10_000n;
      const expectedAgent = (PRICE * 1_000n) / 10_000n;
      const expectedPlatform = PRICE - expectedPhotographer - expectedAgent;

      expect(await usdc.balanceOf(photographer.address)).to.equal(photographerBefore + expectedPhotographer);
      expect(await usdc.balanceOf(agent.address)).to.equal(agentBefore + expectedAgent);
      expect(await usdc.balanceOf(treasury.address)).to.equal(treasuryBefore + expectedPlatform);
    });

    it("mints ERC-1155 license token to publisher", async () => {
      await vault.connect(agent).drawPayment(
        publisher.address, PRICE, PHOTO_ID, PAGE_URL, photographer.address, "editorial"
      );
      expect(await licenseEngine.balanceOf(publisher.address, BigInt(PHOTO_ID))).to.equal(1n);
    });

    it("emits PaymentDrawn and LicenseMinted", async () => {
      await expect(
        vault.connect(agent).drawPayment(
          publisher.address, PRICE, PHOTO_ID, PAGE_URL, photographer.address, "commercial"
        )
      )
        .to.emit(vault, "PaymentDrawn")
        .withArgs(PHOTO_ID, publisher.address, PAGE_URL, PRICE)
        .and.to.emit(licenseEngine, "LicenseMinted");
    });

    it("reverts when publisher balance is insufficient", async () => {
      const bigPrice = ethers.parseUnits("200", 6);
      await expect(
        vault.connect(agent).drawPayment(
          publisher.address, bigPrice, PHOTO_ID, PAGE_URL, photographer.address, "editorial"
        )
      ).to.be.revertedWith("Insufficient publisher balance");
    });

    it("reverts when called without AGENT_ROLE", async () => {
      await expect(
        vault.connect(other).drawPayment(
          publisher.address, PRICE, PHOTO_ID, PAGE_URL, photographer.address, "editorial"
        )
      ).to.be.reverted;
    });
  });

  describe("claimDomain", () => {
    it("registers domain to caller", async () => {
      await vault.connect(publisher).claimDomain("example.com");
      expect(await vault.domainOwners("example.com")).to.equal(publisher.address);
    });

    it("allows domain to be reclaimed", async () => {
      await vault.connect(publisher).claimDomain("example.com");
      await vault.connect(other).claimDomain("example.com");
      expect(await vault.domainOwners("example.com")).to.equal(other.address);
    });
  });

  describe("agency staking", () => {
    beforeEach(async () => {
      await usdc.mint(agency.address, DEPOSIT_AMOUNT);
      await usdc.connect(agency).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
    });

    it("records agency stake", async () => {
      await vault.connect(agency).stakeAgency(DEPOSIT_AMOUNT);
      expect(await vault.agencyStakes(agency.address)).to.equal(DEPOSIT_AMOUNT);
    });

    it("withdrawStake reduces balance", async () => {
      await vault.connect(agency).stakeAgency(DEPOSIT_AMOUNT);
      await vault.connect(agency).withdrawStake(PRICE);
      expect(await vault.agencyStakes(agency.address)).to.equal(DEPOSIT_AMOUNT - PRICE);
    });

    it("withdrawStake reverts when stake insufficient", async () => {
      await expect(vault.connect(agency).withdrawStake(PRICE)).to.be.revertedWith("Insufficient stake");
    });

    it("replenishStake adds to agency stake (agent calls)", async () => {
      await vault.connect(agency).stakeAgency(DEPOSIT_AMOUNT);

      await usdc.mint(agent.address, PRICE);
      await usdc.connect(agent).approve(await vault.getAddress(), PRICE);

      await vault.connect(agent).replenishStake(agency.address, PRICE);
      expect(await vault.agencyStakes(agency.address)).to.equal(DEPOSIT_AMOUNT + PRICE);
    });

    it("replenishStake reverts without AGENT_ROLE", async () => {
      await expect(vault.connect(other).replenishStake(agency.address, PRICE)).to.be.reverted;
    });
  });
});
