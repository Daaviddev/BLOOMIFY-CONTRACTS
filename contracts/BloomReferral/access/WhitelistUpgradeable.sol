// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.13;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title WhitelistUpgradeable
 * @dev The WhitelistUpgradeable contract has a whitelist of addresses, and provides basic authorization control functions.
 * @dev This simplifies the implementation of "user permissions".
 */
contract WhitelistUpgradeable is OwnableUpgradeable {
    mapping(address => bool) public whitelist;

    event WhitelistedAddressAdded(address addr);
    event WhitelistedAddressRemoved(address addr);

    function __Whitelist_init() internal initializer {
        __Ownable_init();
    }

    /**
     * @dev Throws if called by any account that's not whitelisted.
     */
    modifier onlyWhitelisted() {
        require(whitelist[msg.sender], "Not whitelisted!");
        _;
    }

    /**
     * @dev - Add addresses to the whitelist
     * @param addrs - Addresses to be added to whitelist
     * @return success bool - Returns true if at least one address was added to the whitelist,
     * false if all addresses were already in the whitelist
     */
    function addAddressesToWhitelist(address[] memory addrs)
        external
        onlyOwner
        returns (bool success)
    {
        for (uint256 i = 0; i < addrs.length; i++) {
            if (!whitelist[addrs[i]]) {
                whitelist[addrs[i]] = true;
                emit WhitelistedAddressAdded(addrs[i]);
                success = true;
            }
        }
    }

    /**
     * @dev - Remove addresses from the whitelist
     * @param addrs - Addresses to be re,pved from whitelist
     * @return success bool - Returns true if at least one address was removed from the whitelist,
     * false if all addresses weren't in the whitelist in the first place
     */
    function removeAddressesFromWhitelist(address[] memory addrs)
        external
        onlyOwner
        returns (bool success)
    {
        for (uint256 i = 0; i < addrs.length; i++) {
            if (whitelist[addrs[i]]) {
                whitelist[addrs[i]] = false;
                emit WhitelistedAddressRemoved(addrs[i]);
                success = true;
            }
        }
    }
}
