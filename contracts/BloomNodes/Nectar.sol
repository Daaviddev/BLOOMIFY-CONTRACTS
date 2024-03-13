// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.13;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./access/Whitelist.sol";
import "./OwnerRecoveryUpgradeable.sol";
import "./implementations/LiquidityPoolManagerImplementationPointerUpgradeable.sol";
import "./implementations/WalletObserverImplementationPointer.sol";
import "./interfaces/ILiquidityManager.sol";
import "./interfaces/IBloomexRouter02.sol";

contract Nectar is
    Initializable,
    ERC20BurnableUpgradeable,
    OwnableUpgradeable,
    OwnerRecoveryUpgradeable,
    LiquidityPoolManagerImplementationPointerUpgradeable,
    WalletObserverImplementationPointer,
    ReentrancyGuardUpgradeable,
    Whitelist
{
    using SafeMathUpgradeable for uint256;

    // STRUCT

    struct Stats {
        uint256 txs;
        uint256 minted;
    }

    //
    // PUBLIC STATE VARIABLES
    //

    ILiquidityManager public liquidityManager;

    address public treasuryAddress;
    address public pairAddress;
    address public rewardsPool;
    address public bloomNodes;
    address public bloomReferral;
    uint256 public totalTxs;
    uint256 public players;
    uint256 public constant MAX_INT = 2**256 - 1;
    uint256 public constant TARGET_SUPPLY = MAX_INT;

    bool public swappingOnlyFromContract;
    mapping(address => bool) public automatedMarketMakerPairs;

    //
    // PRIVATE STATE VARIABLES
    //

    mapping(address => Stats) private _stats;
    mapping(address => uint8) private _customTaxRate;
    mapping(address => bool) private _hasCustomTax;
    mapping(address => bool) private _isExcluded;
    mapping(address => bool) private _AddressesClearedForSwap;

    bool private _swapEnabled;
    bool private _mintingFinished;
    address[] private _excluded;
    uint256 private _mintedSupply;

    uint8 private constant TAX_DEFAULT = 10; // 10% tax on transfers

    address public router;
    bool public unlockSwap;

    //
    // MODIFIERS
    //

    modifier canMint() {
        require(!_mintingFinished, "Minting is finished");

        _;
    }

    modifier zeroAddressCheck(address _address) {
        require(_address != address(0), "address 0");

        _;
    }

    //
    // EVENTS
    //

    event ToggleSwap();
    event MintingFinished();

    //
    // EXTERNAL FUNCTIONS
    //

    /**
     * @dev - Init function, can only be called once
     * @param _initialSupply - Initial supply of $NCTR tokens
     */
    function initialize(uint256 _initialSupply) external initializer {
        // __Whitelist_init();
        __Ownable_init();
        __ERC20_init("Nectar", "NCTR");
        _mint(_msgSender(), _initialSupply);

        _swapEnabled = true;
        unlockSwap = false;
    }

    function burnNectar(address _from, uint256 _amount) external nonReentrant {
        require(_from == _msgSender(), "not approved");
        require(balanceOf(_from) >= _amount, "not enough tokens");

        super._burn(_from, _amount);
    }

    function mintNectar(address _to, uint256 _amount)
        external
        nonReentrant
        returns (bool)
    {
        require(
            address(liquidityPoolManager) != _to,
            "ApeBloom: Use liquidityReward to reward liquidity"
        );

        if (_msgSender() == bloomNodes || _msgSender() == owner()) {
            super._mint(_to, _amount);

            return true;
        } else if (_msgSender() == bloomReferral) {
            //Never fail, just don't mint if over
            if (_amount == 0 || _mintedSupply.add(_amount) > TARGET_SUPPLY) {
                return false;
            }

            //Mint
            _mintedSupply = _mintedSupply.add(_amount);
            super._mint(_to, _amount);

            if (_mintedSupply == TARGET_SUPPLY) {
                _mintingFinished = true;
                emit MintingFinished();
            }

            /* Members */
            if (_stats[_to].txs == 0) {
                players += 1;
            }

            _stats[_to].txs += 1;
            _stats[_to].minted += _amount;

            totalTxs += 1;

            return true;
        } else {
            revert("Unauthorized");
        }
    }

    //
    // EXTERNAL OWNER FUNCTIONS
    //

    /**
     * @dev - Turns swapping on or off
     * @param _swap - Pass true to enable swapping and false to disable
     */
    function toggleSwap(bool _swap) external onlyOwner {
        _swapEnabled = _swap;
        emit ToggleSwap();
    }

    /**
     * @dev - Function to stop minting new tokens.
     * @return True if the operation was successful.
     */
    function finishMinting() external onlyOwner canMint returns (bool) {
        _mintingFinished = true;
        emit MintingFinished();
        return true;
    }

    /**
     * @dev - Sets new treasury address
     * @param _newTreasuryAddress - Address of the new treasury contract
     */
    function setTreasuryAddress(address _newTreasuryAddress)
        external
        onlyOwner
        zeroAddressCheck(_newTreasuryAddress)
    {
        treasuryAddress = _newTreasuryAddress;
    }

    /**
     * @dev - Sets new router address
     * @param _newRouterAddress - Address of the new router contract
     */
    function setRouterAddress(address _newRouterAddress)
        external
        onlyOwner
        zeroAddressCheck(_newRouterAddress)
    {
        router = _newRouterAddress;
        
        approve(router, type(uint256).max);
        IERC20(0xDE04626ba950B3E2c93cB094463A847237d4e000).approve(router, type(uint256).max);
    }

    /**
     * @dev - Sets new pair address
     * @param _newPairAddress - Address of the new token pair contract
     */
    function setPairAddress(address _newPairAddress)
        external
        onlyOwner
        zeroAddressCheck(_newPairAddress)
    {
        pairAddress = _newPairAddress;
    }

    /**
     * @dev - Sets new Bloomify Rewards Pool address
     * @param _newRewardsPool - Address of the new Bloomify RP contract
     */
    function setRewardsPool(address _newRewardsPool)
        external
        onlyOwner
        zeroAddressCheck(_newRewardsPool)
    {
        rewardsPool = _newRewardsPool;
    }

    /**
     * @dev - Sets bloomNodes address
     * @param _newBloomNodes - New bloomNodes address
     */
    function setBloomNodes(address _newBloomNodes)
        external
        onlyOwner
        zeroAddressCheck(_newBloomNodes)
    {
        bloomNodes = _newBloomNodes;
    }

    /**
     * @dev - Sets bloomReferral address
     * @param _newBloomReferral - New bloomReferral address
     */
    function setBloomReferral(address _newBloomReferral)
        external
        onlyOwner
        zeroAddressCheck(_newBloomReferral)
    {
        bloomReferral = _newBloomReferral;
    }

    /**
     * @dev - Sets the Liquidity Manager address
     * @param _liquidityManager - Address of the Liquidity Manager contract
     */
    function setLiquidityManager(address _liquidityManager)
        public
        onlyOwner
        zeroAddressCheck(_liquidityManager)
    {
        liquidityManager = ILiquidityManager(_liquidityManager);
    }

    /**
     * @dev - Changes bool state of unlockSwap member
     * @param _permission - Boolean to which unlockSwap member will be set
     */
    function flipSwapAllowed(bool _permission) external {
        require(
            msg.sender == owner() || msg.sender == router,
            "Can't set if you're not the owner or Router"
        );

        unlockSwap = _permission;
    }

    //
    // PUBLIC FUNCTIONS
    //

    /**
     * @dev - Necessary override of the ERC20 transfer function
     * @param _to - Address to send $NCTR to
     * @param _amount - Amount of tokens to send
     * @return bool - Returns true if the transfer was successful
     * @notice - Swapping needs to be enabled for this function to work
     *         - This function takes 10% fees by default and burns them
     */
    function transfer(address _to, uint256 _amount)
        public
        override
        zeroAddressCheck(_to)
        returns (bool)
    {
        if (_to != bloomNodes) {
            require(_swapEnabled, "Swap is not enabled");
        }

        if (_to == rewardsPool) {
            super.transfer(_to, _amount);

            return true;
        }

        if (msg.sender == pairAddress) {
            require(unlockSwap, "Swapping locked!");
        }

        if (_msgSender() == treasuryAddress) {
            super.transfer(_to, _amount);
        } else {
            (
                uint256 adjustedAmount,
                uint256 taxAmount
            ) = calculateTransferTaxes(_msgSender(), _amount);

            super.transfer(rewardsPool, taxAmount);
            super.transfer(_to, adjustedAmount);
        }

        return true;
    }

    /**
     * @dev - Necessary override of the ERC20 transferFrom function
     * @param _from - Address from which $NCTR tokens are sent
     * @param _to - Address to send $NCTR to
     * @param _amount - Amount of tokens to send
     * @return bool - Returns true if the transfer was successful
     * @notice - Swapping needs to be enabled for this function to work
     *         - This function takes 10% fees by default and burns them
     */
    function transferFrom(
        address _from,
        address _to,
        uint256 _amount
    ) public override(ERC20Upgradeable) returns (bool) {
        require(
            _to != address(0) && _from != address(0),
            "Nectar: transfer to or from the zero address"
        );
        if (_to != bloomNodes) {
            require(_swapEnabled, "Swap is not enabled");
        }

        if (_to == bloomNodes || _to == treasuryAddress || _to == rewardsPool) {
            super.transferFrom(_from, _to, _amount);

            return true;
        }

        /// @notice This is going to be true if Nectar is being sold
        if (_to == pairAddress) {
            require(unlockSwap, "Swapping locked!");

            (
                uint256 adjustedAmountPair,
                uint256 taxAmountPair
            ) = calculateTransferTaxes(_msgSender(), _amount);

            super.transferFrom(_from, rewardsPool, (taxAmountPair * 34) / 100);
            super.transferFrom(
                _from,
                treasuryAddress,
                (taxAmountPair * 33) / 100
            );
            super._burn(_from, (taxAmountPair * 33) / 100);

            super.transferFrom(_from, _to, adjustedAmountPair);

            return true;
        }

        (uint256 adjustedAmount, uint256 taxAmount) = calculateTransferTaxes(
            _msgSender(),
            _amount
        );

        super.transferFrom(_from, rewardsPool, taxAmount);
        super.transferFrom(_from, _to, adjustedAmount);

        return true;
    }

    /**
     * @dev - Function which calculates transfer taxes (Taxes are 10% by default)
     * @param _from - Address from which the $NCTR tokens are sent
     * @param _value - Amount of tokens which are sent
     * @return adjustedValue - Value after the taxes
     * @return taxAmount - Value of the taxes
     * @notice - Taxes are 10% by default, but addresses can be either excluded from taxes or have custom ones
     */
    function calculateTransferTaxes(address _from, uint256 _value)
        public
        view
        returns (uint256 adjustedValue, uint256 taxAmount)
    {
        adjustedValue = _value;
        taxAmount = 0;

        if (!_isExcluded[_from]) {
            uint8 taxPercent = TAX_DEFAULT; // set to default tax 10%

            // set custom tax rate if applicable
            if (_hasCustomTax[_from]) {
                taxPercent = _customTaxRate[_from];
            }

            (adjustedValue, taxAmount) = _calculateTransactionTax(
                _value,
                taxPercent
            );
        }
        return (adjustedValue, taxAmount);
    }

    //
    // PRIVATE FUNCTIONS
    //

    /**
     * @dev - Calculates transaction taxes
     * @param _value - Value for which to calculate taxes
     * @param _tax - Tax percentage
     */
    function _calculateTransactionTax(uint256 _value, uint8 _tax)
        private
        pure
        returns (uint256 adjustedValue, uint256 taxAmount)
    {
        taxAmount = _value.mul(_tax).div(100);
        adjustedValue = _value.mul(SafeMathUpgradeable.sub(100, _tax)).div(100);
        return (adjustedValue, taxAmount);
    }

    //
    // OVERRIDES
    //

    // /**
    //  * @dev - Passes the addresses to WalletObserverUpgradeable contract so it can track the funds
    //  * @param _from - Address from which the tokens are transfered
    //  * @param _to - Address to which to transfer tokens to
    //  * @param _amount - Amount of tokens transfered
    //  */
    // function _beforeTokenTransfer(
    //     address _from,
    //     address _to,
    //     uint256 _amount
    // ) internal virtual override(ERC20Upgradeable) {
    //     super._beforeTokenTransfer(_from, _to, _amount);
    //     if (address(walletObserver) != address(0)) {
    //         walletObserver.beforeTokenTransfer(
    //             _msgSender(),
    //             _from,
    //             _to,
    //             _amount
    //         );
    //     }
    // }

    function setEnableLiquidityManager(bool _value) external onlyOwner {
        liquidityManager.enableLiquidityManager(_value);
    }

    /***
     * @notice Functions below are implementations necessary for the Horde LM
     */
    function setSwappingOnlyFromContract(bool _value) external onlyOwner {
        swappingOnlyFromContract = _value;
        liquidityManager.enableLiquidityManager(_value);
    }

    function allowSwap(address _addr, bool _value)
        external
        onlyOwner
        zeroAddressCheck(_addr)
    {
        _setSwapAllowed(_addr, _value);
    }

    function swapUsdcForToken(uint256 _amountIn, uint256 _amountOutMin)
        external
    {
        _setSwapAllowed(_msgSender(), true);

        /* liquidityManager.swapUsdcForToken(
            _msgSender(),
            _amountIn,
            _amountOutMin
        ); */

        IERC20(0xDE04626ba950B3E2c93cB094463A847237d4e000).transferFrom(_msgSender(), address(this), _amountIn);

        address[] memory path = new address[](2);
        path[0] = 0xDE04626ba950B3E2c93cB094463A847237d4e000;
        path[1] = address(this);

        IBloomexRouter02(router).swapExactTokensForTokensSupportingFeeOnTransferTokens(
            _amountIn,
            _amountOutMin,
            path,
            _msgSender(),
            block.timestamp
        );

        _setSwapAllowed(_msgSender(), false);
    }

    function swapTokenForUsdc(uint256 _amountIn, uint256 _amountOutMin)
        external
    {
        _setSwapAllowed(_msgSender(), true);
        /* liquidityManager.swapTokenForUsdc(
            _msgSender(),
            _amountIn,
            _amountOutMin
        ); */
        
        transferFrom(_msgSender(), address(this), _amountIn);

        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = 0xDE04626ba950B3E2c93cB094463A847237d4e000;

        IBloomexRouter02(router).swapExactTokensForTokensSupportingFeeOnTransferTokens(
            _amountIn,
            _amountOutMin,
            path,
            _msgSender(),
            block.timestamp
        );

        _setSwapAllowed(_msgSender(), false);
    }

    function _setSwapAllowed(address _addr, bool _value)
        private
        zeroAddressCheck(_addr)
    {
        _AddressesClearedForSwap[_addr] = _value;
    }

    function _beforeTokenTransfer(
        address _from,
        address _recipient,
        uint256
    ) internal view override {
        if (swappingOnlyFromContract) {
            if (automatedMarketMakerPairs[_from]) {
                require(
                    _AddressesClearedForSwap[_recipient],
                    "You are not allowed to SWAP directly on Pancake"
                );
            }

            if (automatedMarketMakerPairs[_recipient]) {
                require(
                    _AddressesClearedForSwap[_from],
                    "You are not allowed to SWAP directly on Pancake"
                );
            }
        }
    }

    /// @notice - Commented out because fees are burnt, however it can be added if necessary
    // function liquidityReward(uint256 amount) external onlyBloomOrOwner {
    //     // require(
    //     //     address(liquidityPoolManager) != address(0),
    //     //     "Bloom: LiquidityPoolManager is not set"
    //     // );
    //     super._mint(treasuryAddress, amount);
    // }
}
