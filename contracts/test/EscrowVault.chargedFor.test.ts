import { expect } from "chai";
import { ethers } from "hardhat";
import { EscrowVault, LicenseEngine, MockUSDC } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("EscrowVault — chargedFor idempotency guard", () => {
  let vault: EscrowVault;
  let licenseEngine: LicenseEngine;
  let usdc: MockUSDC;
  let agent: HardhatEthersSigner;
  let photographer: HardhatEthersSigner;
  let publisher: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;

  const DEPOSIT = ethers.parseUnits("100", 6);
  const PRICE = ethers.parseUnits("1", 6);
  const PHOTO_ID = ethers.keccak256(ethers.toUtf8Bytes("photo-x"));
  const URL_A = "https://example.com/a";
  const URL_B = "https://example.com/b";

  beforeEach(async () => {
    [, agent, photographer, publisher, treasury] = await ethers.getSigners();

    const USDCFactory = await ethers.getContractFactory("MockUSDC");
    usdc = await USDCFactory.deploy();

    const LEFactory = await ethers.getContractFactory("LicenseEngine");
    licenseEngine = await LEFactory.deploy(8500, 1500, treasury.address, await usdc.getAddress());

    const VaultFactory = await ethers.getContractFactory("EscrowVault");
    vault = await VaultFactory.deploy(await licenseEngine.getAddress(), await usdc.getAddress());

    await licenseEngine.grantRole(await licenseEngine.AGENT_ROLE(), await vault.getAddress());
    await vault.grantRole(await vault.AGENT_ROLE(), agent.address);

    await usdc.mint(publisher.address, DEPOSIT);
    await usdc.connect(publisher).approve(await vault.getAddress(), DEPOSIT);
    await vault.connect(publisher).deposit(DEPOSIT);
  });

  it("flips chargedFor[photoId][url] to true after first drawPayment", async () => {
    expect(await vault.chargedFor(PHOTO_ID, URL_A)).to.equal(false);
    await vault.connect(agent).drawPayment(publisher.address, PRICE, PHOTO_ID, URL_A, photographer.address, "editorial");
    expect(await vault.chargedFor(PHOTO_ID, URL_A)).to.equal(true);
  });

  it("reverts on second drawPayment for the same (photoId, url)", async () => {
    await vault.connect(agent).drawPayment(publisher.address, PRICE, PHOTO_ID, URL_A, photographer.address, "editorial");
    await expect(
      vault.connect(agent).drawPayment(publisher.address, PRICE, PHOTO_ID, URL_A, photographer.address, "editorial")
    ).to.be.revertedWith("Already charged for this photo and URL");
  });

  it("does not deduct publisher balance on the rejected retry", async () => {
    await vault.connect(agent).drawPayment(publisher.address, PRICE, PHOTO_ID, URL_A, photographer.address, "editorial");
    const balanceAfterFirst = await vault.getBalance(publisher.address);
    await expect(
      vault.connect(agent).drawPayment(publisher.address, PRICE, PHOTO_ID, URL_A, photographer.address, "editorial")
    ).to.be.reverted;
    expect(await vault.getBalance(publisher.address)).to.equal(balanceAfterFirst);
  });

  it("allows charging the same photo at a different URL", async () => {
    await vault.connect(agent).drawPayment(publisher.address, PRICE, PHOTO_ID, URL_A, photographer.address, "editorial");
    await expect(
      vault.connect(agent).drawPayment(publisher.address, PRICE, PHOTO_ID, URL_B, photographer.address, "editorial")
    ).to.not.be.reverted;
    expect(await vault.chargedFor(PHOTO_ID, URL_A)).to.equal(true);
    expect(await vault.chargedFor(PHOTO_ID, URL_B)).to.equal(true);
  });

  it("deducts exactly once across legitimate first call", async () => {
    await vault.connect(agent).drawPayment(publisher.address, PRICE, PHOTO_ID, URL_A, photographer.address, "editorial");
    expect(await vault.getBalance(publisher.address)).to.equal(DEPOSIT - PRICE);
  });
});
