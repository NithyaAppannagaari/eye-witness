// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract DisputeRegistry is AccessControl {
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    struct Dispute {
        bytes32 photoId;
        string url;
        bytes32 evidenceHash;
        uint256 timestamp;
        bool resolved;
    }

    uint256 public disputeCount;
    mapping(uint256 => Dispute) public disputes;

    event DisputeLogged(string url, bytes32 indexed photoId, uint256 disputeId, uint256 timestamp, bytes32 evidenceHash);
    event DisputeResolved(uint256 indexed disputeId, bytes32 indexed photoId);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function logDispute(
        bytes32 photoId,
        string calldata url,
        bytes32 evidenceHash
    ) external onlyRole(AGENT_ROLE) returns (uint256) {
        uint256 disputeId = disputeCount++;
        disputes[disputeId] = Dispute({
            photoId: photoId,
            url: url,
            evidenceHash: evidenceHash,
            timestamp: block.timestamp,
            resolved: false
        });
        emit DisputeLogged(url, photoId, disputeId, block.timestamp, evidenceHash);
        return disputeId;
    }

    function resolveDispute(uint256 disputeId) external onlyRole(AGENT_ROLE) {
        require(disputeId < disputeCount, "Dispute does not exist");
        Dispute storage d = disputes[disputeId];
        require(!d.resolved, "Already resolved");
        d.resolved = true;
        emit DisputeResolved(disputeId, d.photoId);
    }

    function getDispute(uint256 disputeId) external view returns (Dispute memory) {
        require(disputeId < disputeCount, "Dispute does not exist");
        return disputes[disputeId];
    }
}
