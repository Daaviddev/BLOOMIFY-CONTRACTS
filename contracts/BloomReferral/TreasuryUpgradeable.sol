// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.13;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

import "./access/WhitelistUpgradeable.sol";
import "./interfaces/INectar.sol";
import "./interfaces/ITreasuryUpgradeable.sol";

contract TreasuryUpgradeable is WhitelistUpgradeable, ITreasuryUpgradeable {
    INectar private nectarToken;
    ERC20Upgradeable private usdceToken;

    function initialize(address _nectarTokenAddress, address _USDCeTokenAddress)
        external
        initializer
    {
        __Whitelist_init();

        require(
            _nectarTokenAddress != address(0) &&
                _USDCeTokenAddress != address(0)
        );
        nectarToken = INectar(_nectarTokenAddress);
        usdceToken = ERC20Upgradeable(_USDCeTokenAddress);
    }

    /**
     * @dev - Withdraw desired amount of NCTR from Treasury to desired address - only for whitelisted users
     * @param _to - Address where NCTR will be sent
     * @param _amount - Amount of NCTR to withdraw to desired address
     */
    function withdrawNCTR(address _to, uint256 _amount)
        external
        override
        onlyWhitelisted
    {
        require(
            nectarToken.transfer(_to, _amount),
            "Nectar token transfer failed!"
        );
    }

    /**
     * @dev - Withdraw desired amount of USDC.e from Treasury to desired address - only for whitelisted users
     * @param _to - Address where USDC.e will be sent
     * @param _amount - Amount of USDC.e to withdraw to desired address
     */
    function withdrawUSDCe(address _to, uint256 _amount)
        external
        override
        onlyWhitelisted
    {
        require(
            usdceToken.transfer(_to, _amount),
            "USDC.e token transfer failed!"
        );
    }
}
