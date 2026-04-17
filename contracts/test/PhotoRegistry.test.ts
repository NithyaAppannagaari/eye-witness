import { expect } from "chai";
import { ethers } from "hardhat";
import { PhotoRegistry } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("PhotoRegistry", () => {
  let registry: PhotoRegistry;
  let owner: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  const photoHash = ethers.keccak256(ethers.toUtf8Bytes("test-photo"));
  const metadataHash = ethers.keccak256(ethers.toUtf8Bytes("test-metadata"));
  const defaultRules = {
    editorialPrice: ethers.parseUnits("1", 6),
    commercialPrice: ethers.parseUnits("5", 6),
    aiTrainingPrice: ethers.parseUnits("10", 6),
    blockAiTraining: false,
  };

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PhotoRegistry");
    registry = await Factory.deploy();
  });

  describe("registerPhoto", () => {
    it("stores the photo record and emits PhotoRegistered", async () => {
      const tx = await registry.registerPhoto(photoHash, metadataHash, defaultRules);
      const receipt = await tx.wait();

      await expect(tx)
        .to.emit(registry, "PhotoRegistered")
        .withArgs(photoHash, owner.address, await getBlockTimestamp(receipt!.blockNumber));

      const photo = await registry.getPhoto(photoHash);
      expect(photo.metadataHash).to.equal(metadataHash);
      expect(photo.owner).to.equal(owner.address);
      expect(photo.licenseRules.editorialPrice).to.equal(defaultRules.editorialPrice);
      expect(photo.licenseRules.blockAiTraining).to.equal(false);
    });

    it("reverts when the same photoHash is registered twice", async () => {
      await registry.registerPhoto(photoHash, metadataHash, defaultRules);
      await expect(
        registry.registerPhoto(photoHash, metadataHash, defaultRules)
      ).to.be.revertedWithCustomError(registry, "PhotoAlreadyRegistered");
    });

    it("allows different wallets to register different photos", async () => {
      const otherHash = ethers.keccak256(ethers.toUtf8Bytes("other-photo"));
      await registry.registerPhoto(photoHash, metadataHash, defaultRules);
      await registry.connect(other).registerPhoto(otherHash, metadataHash, defaultRules);

      const p1 = await registry.getPhoto(photoHash);
      const p2 = await registry.getPhoto(otherHash);
      expect(p1.owner).to.equal(owner.address);
      expect(p2.owner).to.equal(other.address);
    });
  });

  describe("getPhoto", () => {
    it("reverts for an unregistered photoHash", async () => {
      const unknown = ethers.keccak256(ethers.toUtf8Bytes("unknown"));
      await expect(registry.getPhoto(unknown))
        .to.be.revertedWithCustomError(registry, "PhotoNotFound");
    });
  });

  describe("checkLicense", () => {
    it("returns false before a license is recorded", async () => {
      await registry.registerPhoto(photoHash, metadataHash, defaultRules);
      expect(await registry.checkLicense(photoHash, "https://example.com/page")).to.be.false;
    });

    it("returns true after recordLicense is called", async () => {
      await registry.registerPhoto(photoHash, metadataHash, defaultRules);
      await registry.recordLicense(photoHash, "https://example.com/page");
      expect(await registry.checkLicense(photoHash, "https://example.com/page")).to.be.true;
    });

    it("returns false for a different URL on the same photo", async () => {
      await registry.registerPhoto(photoHash, metadataHash, defaultRules);
      await registry.recordLicense(photoHash, "https://example.com/page");
      expect(await registry.checkLicense(photoHash, "https://other.com/page")).to.be.false;
    });
  });

  describe("getLicenseRules", () => {
    it("returns the correct rules for a registered photo", async () => {
      const rules = {
        editorialPrice: ethers.parseUnits("2", 6),
        commercialPrice: ethers.parseUnits("8", 6),
        aiTrainingPrice: ethers.parseUnits("0", 6),
        blockAiTraining: true,
      };
      await registry.registerPhoto(photoHash, metadataHash, rules);
      const stored = await registry.getLicenseRules(photoHash);
      expect(stored.editorialPrice).to.equal(rules.editorialPrice);
      expect(stored.blockAiTraining).to.equal(true);
    });

    it("reverts for an unregistered photo", async () => {
      const unknown = ethers.keccak256(ethers.toUtf8Bytes("unknown"));
      await expect(registry.getLicenseRules(unknown))
        .to.be.revertedWithCustomError(registry, "PhotoNotFound");
    });
  });

  async function getBlockTimestamp(blockNumber: number): Promise<number> {
    const block = await ethers.provider.getBlock(blockNumber);
    return block!.timestamp;
  }
});
