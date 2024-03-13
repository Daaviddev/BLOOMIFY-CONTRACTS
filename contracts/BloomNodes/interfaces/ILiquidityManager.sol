// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

interface ILiquidityManager {
    function swapUsdcForToken(
        address to,
        uint256 amountIn,
        uint256 amountOutMin
    ) external;

    function swapTokenForUsdc(
        address to,
        uint256 amountIn,
        uint256 amountOutMin
    ) external;

    function swapTokenForUSDCToWallet(
        address from,
        address destination,
        uint256 tokenAmount,
        uint256 slippage
    ) external;

    function enableLiquidityManager(bool value) external;

    function setRewardAddr(address _rewardPool) external;

    function setTreasuryAddr(address _treasury) external;

    function setTokenContractAddr(address _token) external;

    function setSwapPair(address _pair) external;
}
