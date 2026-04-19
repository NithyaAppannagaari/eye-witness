import { expect } from "chai";
import { ethers } from "hardhat";
import { DisputeRegistry } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("DisputeRegistry", () => {
  let registry: DisputeRegistry;
  let deployer: HardhatEthersSigner;
  let agent: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  const PHOTO_ID = ethers.keccak256(ethers.toUtf8Bytes("photo-1"));
  const URL = "https://example.com/article";
  const EVIDENCE_HASH = ethers.keccak256(ethers.toUtf8Bytes("evidence"));

  beforeEach(async () => {
    [deployer, agent, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("DisputeRegistry");
    registry = await Factory.deploy();

    const AGENT_ROLE = await registry.AGENT_ROLE();
    await registry.grantRole(AGENT_ROLE, agent.address);
  });

  describe("logDispute", () => {
    it("logs a dispute and returns the disputeId", async () => {
      const tx = await registry.connect(agent).logDispute(PHOTO_ID, URL, EVIDENCE_HASH);
      const receipt = await tx.wait();
      expect(await registry.disputeCount()).to.equal(1);

      const dispute = await registry.getDispute(0);
      expect(dispute.photoId).to.equal(PHOTO_ID);
      expect(dispute.url).to.equal(URL);
      expect(dispute.evidenceHash).to.equal(EVIDENCE_HASH);
      expect(dispute.resolved).to.equal(false);
      expect(dispute.timestamp).to.be.gt(0);
    });

    it("emits DisputeLogged event", async () => {
      await expect(registry.connect(agent).logDispute(PHOTO_ID, URL, EVIDENCE_HASH))
        .to.emit(registry, "DisputeLogged")
        .withArgs(URL, PHOTO_ID, 0, await ethers.provider.getBlock("latest").then(b => b!.timestamp + 1), EVIDENCE_HASH);
    });

    it("increments disputeCount for multiple disputes", async () => {
      await registry.connect(agent).logDispute(PHOTO_ID, URL, EVIDENCE_HASH);
      await registry.connect(agent).logDispute(PHOTO_ID, "https://other.com", EVIDENCE_HASH);
      expect(await registry.disputeCount()).to.equal(2);
    });

    it("reverts when called without AGENT_ROLE", async () => {
      await expect(
        registry.connect(other).logDispute(PHOTO_ID, URL, EVIDENCE_HASH)
      ).to.be.reverted;
    });
  });

  describe("resolveDispute", () => {
    beforeEach(async () => {
      await registry.connect(agent).logDispute(PHOTO_ID, URL, EVIDENCE_HASH);
    });

    it("resolves a dispute and sets resolved = true", async () => {
      await registry.connect(agent).resolveDispute(0);
      const dispute = await registry.getDispute(0);
      expect(dispute.resolved).to.equal(true);
    });

    it("emits DisputeResolved event", async () => {
      await expect(registry.connect(agent).resolveDispute(0))
        .to.emit(registry, "DisputeResolved")
        .withArgs(0, PHOTO_ID);
    });

    it("reverts when already resolved", async () => {
      await registry.connect(agent).resolveDispute(0);
      await expect(registry.connect(agent).resolveDispute(0))
        .to.be.revertedWith("Already resolved");
    });

    it("reverts for non-existent disputeId", async () => {
      await expect(registry.connect(agent).resolveDispute(99))
        .to.be.revertedWith("Dispute does not exist");
    });

    it("reverts when called without AGENT_ROLE", async () => {
      await expect(registry.connect(other).resolveDispute(0)).to.be.reverted;
    });
  });

  describe("getDispute", () => {
    it("reverts for non-existent disputeId", async () => {
      await expect(registry.getDispute(0)).to.be.revertedWith("Dispute does not exist");
    });
  });
});
