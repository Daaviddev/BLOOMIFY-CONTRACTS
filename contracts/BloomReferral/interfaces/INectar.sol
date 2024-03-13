// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.13;

interface INectar {
    function approve(address spender, uint256 amount) external returns (bool);

    function balanceOf(address account) external returns (uint256);

    function burnNectar(address account, uint256 amount) external;

    function mintNectar(address _to, uint256 _amount) external returns (bool);

    function transfer(address to, uint256 amount) external returns (bool);

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    function swapUsdcForToken(uint256 _amountIn, uint256 _amountOutMin)
        external;

    function swapTokenForUsdc(uint256 _amountIn, uint256 _amountOutMin)
        external;
}
