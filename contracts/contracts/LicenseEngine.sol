// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract LicenseEngine is ERC1155, AccessControl, ReentrancyGuard {
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    IERC20 public immutable usdc;
    address public immutable platformTreasury;
    uint96 public immutable photographerCut;
    uint96 public immutable platformCut;

    event LicenseMinted(
        string url,
        bytes32 indexed photoId,
        address indexed publisher,
        string useType,
        uint256 timestamp
    );

    constructor(
        uint96 _photographerCut,
        uint96 _platformCut,
        address _platformTreasury,
        address _usdcAddress
    ) ERC1155("") {
        require(_photographerCut + _platformCut == 10_000, "Cuts must sum to 10000");
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        photographerCut = _photographerCut;
        platformCut = _platformCut;
        platformTreasury = _platformTreasury;
        usdc = IERC20(_usdcAddress);
    }

    // Called by EscrowVault (which must have AGENT_ROLE).
    // EscrowVault pre-approves this contract to pull `amount` of USDC from itself,
    // then splits it: 85% to photographer, 15% to platform.
    function mintLicense(
        bytes32 photoId,
        address publisher,
        address photographer,
        string calldata useType,
        uint256 amount,
        string calldata url
    ) external onlyRole(AGENT_ROLE) nonReentrant {
        address vault = msg.sender;

        uint256 photographerAmount = (amount * photographerCut) / 10_000;
        uint256 platformAmount = amount - photographerAmount;

        if (photographerAmount > 0) usdc.transferFrom(vault, photographer, photographerAmount);
        if (platformAmount > 0) usdc.transferFrom(vault, platformTreasury, platformAmount);

        _mint(publisher, uint256(photoId), 1, "");

        emit LicenseMinted(url, photoId, publisher, useType, block.timestamp);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
