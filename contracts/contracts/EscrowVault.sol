// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ILicenseEngine {
    function mintLicense(
        bytes32 photoId,
        address publisher,
        address photographer,
        address agentWallet,
        string calldata useType,
        uint256 amount,
        string calldata url
    ) external;
}

contract EscrowVault is AccessControl, ReentrancyGuard {
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    ILicenseEngine public immutable licenseEngine;
    IERC20 public immutable usdc;

    mapping(address => uint256) public publisherBalances;
    mapping(address => uint256) public agencyStakes;
    mapping(string => address) public domainOwners;

    event Deposited(address indexed publisher, uint256 amount);
    event Withdrawn(address indexed publisher, uint256 amount);
    event PaymentDrawn(bytes32 indexed photoId, address indexed publisher, string url, uint256 amount);
    event DomainClaimed(string domain, address indexed owner);
    event StakeDeposited(address indexed agency, uint256 amount);
    event StakeWithdrawn(address indexed agency, uint256 amount);
    event StakeReplenished(address indexed agency, uint256 amount);

    constructor(address _licenseEngine, address _usdcAddress) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        licenseEngine = ILicenseEngine(_licenseEngine);
        usdc = IERC20(_usdcAddress);
    }

    // --- Publisher escrow ---

    function deposit(uint256 amount) external nonReentrant {
        publisherBalances[msg.sender] += amount;
        usdc.transferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(publisherBalances[msg.sender] >= amount, "Insufficient balance");
        publisherBalances[msg.sender] -= amount;
        usdc.transfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function getBalance(address account) external view returns (uint256) {
        return publisherBalances[account];
    }

    // Publisher registers their domain on-chain so the agent can look them up by URL.
    function claimDomain(string calldata domain) external {
        domainOwners[domain] = msg.sender;
        emit DomainClaimed(domain, msg.sender);
    }

    // Agent calls this after detecting an unlicensed use.
    // Deducts publisher balance, approves LicenseEngine to pull the funds, then mints license.
    function drawPayment(
        address publisher,
        uint256 amount,
        bytes32 photoId,
        string calldata url,
        address photographer,
        string calldata useType
    ) external onlyRole(AGENT_ROLE) nonReentrant {
        require(publisherBalances[publisher] >= amount, "Insufficient publisher balance");
        publisherBalances[publisher] -= amount;

        // Approve LicenseEngine to pull exactly `amount` from this vault, then call mintLicense.
        // LicenseEngine (msg.sender there = this vault) uses transferFrom to split to recipients.
        usdc.approve(address(licenseEngine), amount);
        licenseEngine.mintLicense(photoId, publisher, photographer, msg.sender, useType, amount, url);

        emit PaymentDrawn(photoId, publisher, url, amount);
    }

    // --- Agency staking ---

    function stakeAgency(uint256 amount) external nonReentrant {
        agencyStakes[msg.sender] += amount;
        usdc.transferFrom(msg.sender, address(this), amount);
        emit StakeDeposited(msg.sender, amount);
    }

    function withdrawStake(uint256 amount) external nonReentrant {
        require(agencyStakes[msg.sender] >= amount, "Insufficient stake");
        agencyStakes[msg.sender] -= amount;
        usdc.transfer(msg.sender, amount);
        emit StakeWithdrawn(msg.sender, amount);
    }

    // Agent calls this to route its fee cut back into an agency's stake.
    // Agent must approve this vault to spend the amount before calling.
    function replenishStake(address agency, uint256 amount) external onlyRole(AGENT_ROLE) nonReentrant {
        agencyStakes[agency] += amount;
        usdc.transferFrom(msg.sender, address(this), amount);
        emit StakeReplenished(agency, amount);
    }
}
