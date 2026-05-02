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
    mapping(string => address) public domainOwners;

    // Idempotency guard: once a (photoId, url) pair has been charged, it cannot be charged again.
    // Prevents double-deduction if the agent retries a tx whose receipt it already mined.
    mapping(bytes32 => mapping(string => bool)) public chargedFor;

    event Deposited(address indexed publisher, uint256 amount);
    event Withdrawn(address indexed publisher, uint256 amount);
    event PaymentDrawn(bytes32 indexed photoId, address indexed publisher, string url, uint256 amount);
    event DomainClaimed(string domain, address indexed owner);

    constructor(address _licenseEngine, address _usdcAddress) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        licenseEngine = ILicenseEngine(_licenseEngine);
        usdc = IERC20(_usdcAddress);
    }

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
        require(!chargedFor[photoId][url], "Already charged for this photo and URL");
        require(publisherBalances[publisher] >= amount, "Insufficient publisher balance");

        // Effects before interactions: mark charged + debit balance, then call external contract.
        chargedFor[photoId][url] = true;
        publisherBalances[publisher] -= amount;

        usdc.approve(address(licenseEngine), amount);
        licenseEngine.mintLicense(photoId, publisher, photographer, useType, amount, url);

        emit PaymentDrawn(photoId, publisher, url, amount);
    }
}
