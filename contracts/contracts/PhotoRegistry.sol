// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PhotoRegistry {
    struct LicenseRules {
        uint256 editorialPrice;
        uint256 commercialPrice;
        uint256 aiTrainingPrice;
        bool blockAiTraining;
    }

    struct Photo {
        bytes32 metadataHash;
        address owner;
        uint256 timestamp;
        LicenseRules licenseRules;
        bool exists;
    }

    mapping(bytes32 => Photo) private photos;
    mapping(bytes32 => mapping(string => bool)) private licenses;

    event PhotoRegistered(bytes32 indexed photoHash, address indexed owner, uint256 timestamp);

    error PhotoAlreadyRegistered(bytes32 photoHash);
    error PhotoNotFound(bytes32 photoHash);

    function registerPhoto(
        bytes32 photoHash,
        bytes32 metadataHash,
        LicenseRules calldata rules
    ) external {
        if (photos[photoHash].exists) revert PhotoAlreadyRegistered(photoHash);

        photos[photoHash] = Photo({
            metadataHash: metadataHash,
            owner: msg.sender,
            timestamp: block.timestamp,
            licenseRules: rules,
            exists: true
        });

        emit PhotoRegistered(photoHash, msg.sender, block.timestamp);
    }

    function getPhoto(bytes32 photoHash) external view returns (Photo memory) {
        if (!photos[photoHash].exists) revert PhotoNotFound(photoHash);
        return photos[photoHash];
    }

    function checkLicense(bytes32 photoHash, string calldata url) external view returns (bool) {
        return licenses[photoHash][url];
    }

    function getLicenseRules(bytes32 photoHash) external view returns (LicenseRules memory) {
        if (!photos[photoHash].exists) revert PhotoNotFound(photoHash);
        return photos[photoHash].licenseRules;
    }

    // Called by LicenseEngine when a license is minted (Phase 3)
    function recordLicense(bytes32 photoHash, string calldata url) external {
        licenses[photoHash][url] = true;
    }
}
