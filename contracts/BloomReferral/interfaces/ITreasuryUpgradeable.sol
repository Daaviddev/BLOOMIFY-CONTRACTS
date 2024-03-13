// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.13;

interface ITreasuryUpgradeable {
    function withdrawNCTR(address _to, uint256 _amount) external;

    function withdrawUSDCe(address _to, uint256 _amount) external;
}
