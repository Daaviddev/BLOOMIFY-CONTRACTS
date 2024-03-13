// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.13;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";

import "./interfaces/IBloomexRouter02.sol";
import "./interfaces/INectar.sol";
import "./interfaces/ITreasuryUpgradeable.sol";

contract FlowerUpgradeable is OwnableUpgradeable {
    struct User {
        // USDC.e wallet
        address walletUSDCe;
        // Referral Info
        address upline;
        // Deposit Accounting
        uint256 depositsNCTR;
        uint256 depositsUSDCe;
        uint256 lastDepositTime;
        uint256 APR;
        // Payout Accounting
        uint256 payouts;
        uint256 dailyClaimAmount;
        uint256 uplineRewardTracker;
        uint256 lastActionTime;
        uint256 nextActionTime;
    }

    struct Airdrop {
        // Airdrop tracking
        uint256 airdropsGiven;
        uint256 airdropsReceived;
        uint256 lastAirdropTime;
    }

    mapping(address => User) public users;
    mapping(address => Airdrop) public airdrops;

    uint256 private constant MAX_PERC = 100;
    uint256 private constant MAX_PERMILLE = 1000;
    uint256 private constant MIN_NUM_OF_REF_FOR_TEAM_WALLET = 5;
    uint256 private constant MAX_NUM_OF_REF_FOR_OWNER = 15;
    uint256 private constant MIN_TIER_LVL = 1;
    uint256 private constant MAX_TIER_LVL = 15;
    uint256 private constant NUM_OF_TIERS = 16; // 16th wallet is the dev's wallet

    mapping(address => address[]) public userDownlines;
    mapping(address => mapping(address => uint256)) public userDownlinesIndex;

    uint256 public totalAirdrops;
    uint256 public totalUsers;
    uint256 public totalDepositedNCTR;
    uint256 public totalDepositedUSDCe;
    uint256 public totalWithdraw;

    INectar public nectarToken;
    ERC1155Upgradeable public tierNFT;
    ERC20Upgradeable public USDCeToken;

    IBloomexRouter02 public router;
    ITreasuryUpgradeable public treasury;
    address public devWalletAddressNCTR;
    address public devWalletAddressUSDCe;
    address public pairAddress;
    address public liquidityManagerAddress;

    uint256 public depositTax;
    uint256 private depositBurnPercNCTR;
    uint256 private depositFlowerPercNCTR;
    uint256 private depositLpPercNCTR;
    uint256 private depositLpPercUSDCe;
    uint256 private depositTreasuryPercUSDCe;

    uint256 public compoundTax;
    uint256 private compoundBurnPercNCTR;
    uint256 private compoundUplinePercNCTR;
    uint256 private compoundUplinePercUSDCe;

    uint256 public claimTax;
    // uint256 public sellTax; // not used for now
    // WHALE TAX work in progress

    uint256 public teamWalletDownlineRewardPerc;

    mapping(address => uint256) public userCompoundRewards;

    event Deposit(address indexed addr, uint256 amount, address indexed token);
    event Reward(address indexed addr, uint256 amount, address indexed token);
    event TeamReward(
        address indexed teamLead,
        address indexed teamMember,
        uint256 amount,
        address indexed token
    );
    event Claim(address indexed addr, uint256 amount);
    event AirdropNCTR(
        address indexed from,
        address[] indexed receivers,
        uint256[] airdrops,
        uint256 timestamp
    );

    event DownlineUpdated(address indexed upline, address[] downline);

    struct DownlineRewardTracker {
        uint256 compoundDownlineNCTR;
        uint256 compoundDownlineeUSDCe;
        uint256 depositDownlineNCTR;
        uint256 depositDownlineeUSDCe;
    }

    mapping(address => DownlineRewardTracker) public downlineRewardTracker;

    event CompoundRewardFrom(
        address indexed addr,
        address indexed from,
        uint256 amountNCTR,
        uint256 amountUsce
    );
    event DepositRewardFrom(
        address indexed addr,
        address indexed from,
        uint256 amountNCTR,
        uint256 amountUsce
    );

    /**
     * @dev - Initializes the contract and initiates necessary state variables
     * @param _tierNFTAddress - Address of the TierNFT token contract
     * @param _nectarTokenAddress - Address of the NCTR token contract
     * @param _USDCeTokenAddress - Address of the USDC.e token contract
     * @param _treasuryAddress - Address of the treasury
     * @param _routerAddress - Address of the Router contract
     * @param _devWalletAddressNCTR - Address of the developer's NCTR wallet
     * @param _devWalletAddressUSDCe - Address of the developer's USDC.e wallet
     * @notice - Can only be initialized once
     */
    function initialize(
        address _tierNFTAddress,
        address _nectarTokenAddress,
        address _USDCeTokenAddress,
        address _treasuryAddress,
        address _routerAddress,
        address _devWalletAddressNCTR,
        address _devWalletAddressUSDCe,
        address _liquidityManagerAddress
    ) external initializer {
        require(_tierNFTAddress != address(0));
        require(_nectarTokenAddress != address(0));
        require(_USDCeTokenAddress != address(0));
        require(_treasuryAddress != address(0));
        require(_routerAddress != address(0));
        require(_devWalletAddressNCTR != address(0));
        require(_devWalletAddressUSDCe != address(0));
        require(_liquidityManagerAddress != address(0));

        __Ownable_init();

        // NFT for tier level representation
        tierNFT = ERC1155Upgradeable(_tierNFTAddress);
        // Nectar token
        nectarToken = INectar(_nectarTokenAddress);
        // USDC.e token
        USDCeToken = ERC20Upgradeable(_USDCeTokenAddress);
        // Treasury
        treasury = ITreasuryUpgradeable(_treasuryAddress);
        // Router
        router = IBloomexRouter02(_routerAddress);
        // Developer's wallet addresses
        devWalletAddressNCTR = _devWalletAddressNCTR;
        devWalletAddressUSDCe = _devWalletAddressUSDCe;

        // Liquidity manager address
        liquidityManagerAddress = _liquidityManagerAddress;

        // Initialize contract state variables
        totalUsers += 1;

        depositTax = 10;
        depositBurnPercNCTR = 20;
        depositFlowerPercNCTR = 60;
        depositLpPercNCTR = 20;
        depositLpPercUSDCe = 20;
        depositTreasuryPercUSDCe = 80;

        compoundTax = 10;
        compoundBurnPercNCTR = 50;
        compoundUplinePercNCTR = 90;
        compoundUplinePercUSDCe = 10;

        claimTax = 10;
        // sellTax = 10;

        teamWalletDownlineRewardPerc = 25;

        // Initialize owner's APR
        users[owner()].APR = 5;
    }

    /*****************************************************************/
    /********** Modifiers ********************************************/
    modifier onlyBloomReferralNode() {
        require(
            users[msg.sender].upline != address(0) || msg.sender == owner(),
            "Caller must be in the Bloom Referral system!"
        );

        _;
    }

    modifier noZeroAddress(address _addr) {
        require(_addr != address(0), "Zero address!");

        _;
    }

    modifier onlyValidPercentage(uint256 _percentage) {
        require(_percentage <= 100, "Percentage greater than 100!");

        _;
    }

    modifier onlyAmountGreaterThanZero(uint256 _amount) {
        require(_amount > 0, "Amount should be greater than zero!");

        _;
    }

    /*************************************************************************/
    /****** Management Functions *********************************************/

    /**
     * @dev - Update deposit tax with onlyOwner rights
     * @param _newDepositTax - New deposit tax
     */
    function updateDepositTax(uint256 _newDepositTax)
        external
        onlyOwner
        onlyValidPercentage(_newDepositTax)
    {
        depositTax = _newDepositTax;
    }

    /**
     * @dev - Update deposit distribution percentages with onlyOwner rights
     * @param _depositBurnPercNCTR - Percentage of Nectar to be burned
     * @param _depositFlowerPercNCTR - Percentage of Nectar to be sent to the Flower
     * @param _depositLpPercNCTR - Percentage of Nectar to be added to liquidity pool
     * @param _depositLpPercUSDCe - Percentage of USDC.e to be added to liquidity pool
     * @param _depositTreasuryPercUSDCe - Percentage of USDC.e to be sent to the Treasury
     */
    function updateDepositDistributionPercentages(
        uint256 _depositBurnPercNCTR,
        uint256 _depositFlowerPercNCTR,
        uint256 _depositLpPercNCTR,
        uint256 _depositLpPercUSDCe,
        uint256 _depositTreasuryPercUSDCe
    ) external onlyOwner {
        require(
            _depositBurnPercNCTR +
                _depositFlowerPercNCTR +
                _depositLpPercNCTR ==
                MAX_PERC,
            "Nectar deposit percentages not summing up to 100!"
        );
        require(
            _depositLpPercUSDCe + _depositTreasuryPercUSDCe == MAX_PERC,
            "USDC.e deposit percentages not summing up to 100!"
        );
        require(
            _depositLpPercNCTR == _depositLpPercUSDCe,
            "Different LP percentages!"
        );

        depositBurnPercNCTR = _depositBurnPercNCTR;
        depositFlowerPercNCTR = _depositFlowerPercNCTR;
        depositLpPercNCTR = _depositLpPercNCTR;
        depositLpPercUSDCe = _depositLpPercUSDCe;
        depositTreasuryPercUSDCe = _depositTreasuryPercUSDCe;
    }

    /**
     * @dev - Update compound tax with onlyOwner rights
     * @param _newCompoundTax - New compound tax
     */
    function updateCompoundTax(uint256 _newCompoundTax)
        external
        onlyOwner
        onlyValidPercentage(_newCompoundTax)
    {
        compoundTax = _newCompoundTax;
    }

    /**
     * @dev - Update compound distribution percentages with onlyOwner rights
     * @param _compoundBurnPercNCTR - Percentage of Nectar to be burned
     * @param _compoundUplinePercNCTR - Percentage of Nectar to be sent to the upline's deposit section
     * @param _compoundUplinePercUSDCe - Percentage of USDC.e to be sent to the upline's wallet
     */
    function updateCompoundDistributionPercentages(
        uint256 _compoundBurnPercNCTR,
        uint256 _compoundUplinePercNCTR,
        uint256 _compoundUplinePercUSDCe
    ) external onlyOwner {
        require(
            _compoundBurnPercNCTR +
                _compoundUplinePercNCTR +
                _compoundUplinePercUSDCe ==
                MAX_PERC,
            "Compound percentages not summing up to 100!"
        );

        compoundBurnPercNCTR = _compoundBurnPercNCTR;
        compoundUplinePercNCTR = _compoundUplinePercNCTR;
        compoundUplinePercUSDCe = _compoundUplinePercUSDCe;
    }

    /**
     * @dev - Update claim tax with onlyOwner rights
     * @param _newClaimTax - New claim tax
     */
    function updateClaimTax(uint256 _newClaimTax)
        external
        onlyOwner
        onlyValidPercentage(_newClaimTax)
    {
        claimTax = _newClaimTax;
    }

    /**
     * @dev - Update sell tax with onlyOwner rights
     * @param _newSellTax - New sell tax
     */
    // function updateSellTax(uint256 _newSellTax) external onlyOwner {
    //     sellTax = _newSellTax;
    // }

    /**
     * @dev - Update reward percentage for downline that has a team
     * @param _teamWalletDownlineRewardPerc - New percentage of downline reward that has a team
     */
    function updateTeamWalletDownlineRewardPerc(
        uint256 _teamWalletDownlineRewardPerc
    ) external onlyOwner onlyValidPercentage(_teamWalletDownlineRewardPerc) {
        teamWalletDownlineRewardPerc = _teamWalletDownlineRewardPerc;
    }

    /*******************************************************************************/
    /********** Private Functions **************************************************/

    /**
     * @dev - Calculate percentage part of given number
     * @param _number - Number on which percentage part will be calculated
     * @param _percentage - Percentage to calculate part of the _number
     * @return uint256 - Percentage part of the _number
     */
    function _calculatePercentagePart(uint256 _number, uint256 _percentage)
        private
        pure
        onlyValidPercentage(_percentage)
        returns (uint256)
    {
        return (_number * _percentage) / MAX_PERC;
    }

    /**
     * @dev - Calculate permille part of given number
     * @param _number - Number on which permille part will be calculated
     * @param _permille - Permille to calculate part of the _number
     * @return uint256 - Permille part of the _number
     */
    function _calculatePermillePart(uint256 _number, uint256 _permille)
        private
        pure
        returns (uint256)
    {
        require(_permille <= MAX_PERMILLE, "Invalid permille!");

        return (_number * _permille) / MAX_PERMILLE;
    }

    /**
     * @dev - Calculate realized amount and tax amount for given tax
     * @param _amount - Amount on which tax will be applied
     * @param _tax - Tax percentage that cannot be greater than 50%
     * @return (uint256, uint256) - Tuple with amount after aplied tax and tax amount
     */
    function _calculateTax(uint256 _amount, uint256 _tax)
        private
        pure
        returns (uint256, uint256)
    {
        uint256 taxedAmount = _calculatePercentagePart(_amount, _tax);

        return (_amount - taxedAmount, taxedAmount);
    }

    /**
     * @dev - Check if upline if eligible for rewards (to have appropriate NFT and is net positive)
     * @param _user - User for which tier level is calculated
     * @return id uint256 - Returns tier level of user, zero if user has no appropriate NFT for any tier level
     */
    function _getTierLevel(address _user)
        private
        view
        noZeroAddress(_user)
        returns (uint256 id)
    {
        for (id = MAX_TIER_LVL; id >= MIN_TIER_LVL; id--) {
            if (tierNFT.balanceOf(_user, id) > 0) {
                break;
            }
        }

        return id;
    }

    /**
     * @dev - Check if upline if eligible for rewards (to have appropriate NFT and is net positive)
     * @param _upline - Upline user, the one that gave referral key
     * @param _downlineDepth - Depth of a downline user calculated from _upline user
     * @return bool - Returns true if upline is eligible for rewards
     */
    function _getRewardEligibility(address _upline, uint256 _downlineDepth)
        private
        view
        noZeroAddress(_upline)
        returns (bool)
    {
        return
            _getTierLevel(_upline) > _downlineDepth &&
            getDepositedValue(_upline) + airdrops[_upline].airdropsGiven >
            users[_upline].payouts;
    }

    /**
     * @dev - Adds liquidity to the liquidity pool
     * @param _nctrToLiquidityAmount - Amount of NCTR to add
     * @param _usdcToLiquidityAmount - Amount of USDC.e to add
     */
    function _routerAddLiquidity(
        uint256 _nctrToLiquidityAmount,
        uint256 _usdcToLiquidityAmount
    ) private {
        nectarToken.approve(address(router), _nctrToLiquidityAmount);
        USDCeToken.approve(address(router), _usdcToLiquidityAmount);
        (uint256 amountA, uint256 amountB, uint256 liquidity) = router
            .addLiquidity(
                address(USDCeToken),
                address(nectarToken),
                _usdcToLiquidityAmount,
                _nctrToLiquidityAmount,
                0,
                0,
                owner(),
                type(uint256).max
            );
    }

    /**
     * @dev - Updates team's APR. If a team leader has 5 or more downlines then whole team gets 1% APR and 0.5% otherwise
     * @param _teamLeader - Upline that is a team leader for a team which APR needs to be updated
     */
    function updateAPR(address _teamLeader) public {
        address[] storage downlines = userDownlines[_teamLeader];
        if (downlines.length >= MIN_NUM_OF_REF_FOR_TEAM_WALLET) {
            users[_teamLeader].APR = 10;
            _updateDailyClaimAmount(_teamLeader);
            for (uint256 i = 0; i < downlines.length; i++) {
                users[downlines[i]].APR = 10;
                _updateDailyClaimAmount(downlines[i]);
            }
        } else {
            users[_teamLeader].APR = 5;
            _updateDailyClaimAmount(_teamLeader);
            for (uint256 i = 0; i < downlines.length; i++) {
                users[downlines[i]].APR = 5;
                _updateDailyClaimAmount(downlines[i]);
            }
        }
    }

    /**
     * @dev - Updates users daily claim amount based on its APR
     * @param _user - User which daily claim amount needs to be updated
     */
    function _updateDailyClaimAmount(address _user) private {
        uint256 depositedValue = getDepositedValue(_user);

        users[_user].dailyClaimAmount = _calculatePermillePart(
            depositedValue,
            users[_user].APR
        );
    }

    /**
     * @dev - Updates users last and next possible action (claim/compound) time
     * @param _user - User for which last and next possible action will be updated
     */
    function _updateActionTime(address _user) private {
        users[_user].lastActionTime = block.timestamp;
        users[_user].nextActionTime = users[_user].lastActionTime + 1 days;
    }

    /******************************************************************************/
    /********** Public Functions **************************************************/

    /**
     * @dev - Getter for all of user's downlines
     * @param _user - User address for which we want to get all the downlines
     * @return - Array of addresses that represents all of the user's downlines
     */
    function getUserDownlines(address _user)
        public
        view
        noZeroAddress(_user)
        returns (address[] memory)
    {
        return userDownlines[_user];
    }

    /**
     * @dev - Calculates DEPOSITED VALUE for given user: deposits + airdrops received
     * @param _user - User address for which we want to calculate DEPOSITED VALUE
     * @return uint256 - Returns the user's DEPOSITED VALUE
     */
    function getDepositedValue(address _user)
        public
        view
        noZeroAddress(_user)
        returns (uint256)
    {
        return
            airdrops[_user].airdropsReceived +
            users[_user].depositsNCTR *
            2 +
            userCompoundRewards[_user];
    }

    /**
     * @dev - Calculates PENDING REWARD for given user
     * @param _user - User address for which we want to calculate PENDING REWARD
     * @return uint256 - Returns the user's PENDING REWARD
     */
    function getPendingReward(address _user)
        public
        view
        noZeroAddress(_user)
        returns (uint256)
    {
        uint256 timeSinceLastAction = block.timestamp - users[_user].lastActionTime;
        if (timeSinceLastAction > 3 days) timeSinceLastAction = 3 days;
        return users[_user].dailyClaimAmount * timeSinceLastAction / 1 days;
    }

    /**
     * @dev - Set USDC.e/NCTR pair address
     * @param _pairAddress - Address of USDC.e/NCTR pair
     */
    function setPairAddress(address _pairAddress)
        external
        onlyOwner
        noZeroAddress(_pairAddress)
    {
        pairAddress = _pairAddress;
    }


    /**
     * @dev - Change the timer for the next action
     * @param _user - Address of the user to target
     * @param _nextActionTime - Timestamp of the next action
     */
    function changeNextActionTime(address _user, uint256 _nextActionTime)
        external
        onlyOwner
        noZeroAddress(_user)
    {
        users[_user].nextActionTime = _nextActionTime;
    }

    /**
     * @dev - Change the timer for the last action
     * @param _user - Address of the user to target
     * @param _lastActionTime - Timestamp of the last action
     */
    function changeLastActionTime(address _user, uint256 _lastActionTime)
        external
        onlyOwner
        noZeroAddress(_user)
    {
        users[_user].lastActionTime = _lastActionTime;
    }


    /**
     * @dev - Change the amount of token claim today
     * @param _user - Address of the user to target
     * @param _dailyClaimAmount - Amount of token claim
     */
    function changeAirdropsGiven(address _user, uint256 _dailyClaimAmount)
        external
        onlyOwner
        noZeroAddress(_user)
    {
        users[_user].dailyClaimAmount = _dailyClaimAmount;
    }


    /**
     * @dev - Change the payout of a specific user
     * @param _user - Address of the user to target
     * @param _payout - New payout value
     */
    function changePayouts(address _user, uint256 _payout)
        external
        onlyOwner
        noZeroAddress(_user)
    {
        users[_user].payouts = _payout;
    }


    /**
     * @dev - Deposit with upline referral
     * @param _amountUSDCe - Desired amount in USDC.e for deposit on which deposit tax is applied
     * @param _upline - Upline address
     */
    function deposit(uint256 _amountUSDCe, address _upline)
        external
        noZeroAddress(_upline)
        onlyAmountGreaterThanZero(_amountUSDCe)
    {
        require(
            _upline != owner() ||
                userDownlines[_upline].length < MAX_NUM_OF_REF_FOR_OWNER,
            "Owner can have max 15 referrals!"
        );

        require(
            users[_upline].depositsNCTR > 0 || _upline == owner(),
            "Given upline is not node in Bloom Referral or it's not the owner"
        );

        require(
            USDCeToken.transferFrom(msg.sender, address(this), _amountUSDCe)
        );

        if (getPendingReward(msg.sender) > 0) _compoundRewards();

        // If sender is a new user
        if (users[msg.sender].upline == address(0) && msg.sender != owner()) {
            users[msg.sender].upline = _upline;

            address[] storage downlines = userDownlines[_upline];
            downlines.push(msg.sender);
            userDownlinesIndex[_upline][msg.sender] = downlines.length - 1;

            updateAPR(_upline);
            totalUsers += 1;
            emit DownlineUpdated(_upline, downlines);
        }

        if (
            users[msg.sender].upline != address(0) &&
            _upline != users[msg.sender].upline
        ) {
            address oldUpline = users[msg.sender].upline;
            users[msg.sender].upline = _upline;

            address[] storage downlinesOld = userDownlines[oldUpline];
            address[] storage downlinesNew = userDownlines[_upline];

            uint256 downlineOldIndex = userDownlinesIndex[oldUpline][
                msg.sender
            ];
            address lastAddressInDowlinesOld = downlinesOld[
                downlinesOld.length - 1
            ];
            downlinesOld[downlineOldIndex] = lastAddressInDowlinesOld;
            userDownlinesIndex[oldUpline][
                lastAddressInDowlinesOld
            ] = downlineOldIndex;
            downlinesOld.pop();

            downlinesNew.push(msg.sender);
            userDownlinesIndex[_upline][msg.sender] = downlinesNew.length - 1;

            updateAPR(oldUpline);
            updateAPR(_upline);

            emit DownlineUpdated(oldUpline, downlinesOld);
            emit DownlineUpdated(_upline, downlinesNew);
        }

        // Swap 50% of USDC.e tokens for NCTR
        uint256 amountUSDCe = _amountUSDCe / 2;
        uint256 nectarBalanceBefore = nectarToken.balanceOf(address(this));

        USDCeToken.approve(address(nectarToken), amountUSDCe);
        nectarToken.swapUsdcForToken(amountUSDCe, 1);

        uint256 amountNCTR = nectarToken.balanceOf(address(this)) -
            nectarBalanceBefore;
        // Calculate realized deposit (after tax) in NCTR and in USDC.e
        (uint256 realizedDepositNCTR, uint256 uplineRewardNCTR) = _calculateTax(
            amountNCTR,
            depositTax
        );
        (
            uint256 realizedDepositUSDCe,
            uint256 uplineRewardUSDCe
        ) = _calculateTax(amountUSDCe, depositTax);

        // Update user's NCTR and USDC.e deposit sections
        users[msg.sender].depositsNCTR += amountNCTR;
        users[msg.sender].depositsUSDCe += realizedDepositUSDCe;
        users[msg.sender].lastDepositTime = block.timestamp;

        emit Deposit(msg.sender, amountNCTR, address(nectarToken));
        emit Deposit(msg.sender, realizedDepositUSDCe, address(USDCeToken));

        // Update stats
        totalDepositedNCTR += amountNCTR;
        totalDepositedUSDCe += realizedDepositUSDCe;

        // Reward an upline if it's eligible
        if (_getRewardEligibility(_upline, 0)) {
            // Update _upline's deposit section
            users[_upline].depositsNCTR += uplineRewardNCTR;

            // Send USDC.e reward to _upline's USDC.e wallet address
            require(
                USDCeToken.transfer(_upline, uplineRewardUSDCe),
                "USDC.e token transfer failed!"
            );

            emit Reward(_upline, uplineRewardUSDCe, address(USDCeToken));

            downlineRewardTracker[_upline]
                .depositDownlineNCTR += uplineRewardNCTR;
            downlineRewardTracker[_upline]
                .depositDownlineeUSDCe += uplineRewardUSDCe;
            emit DepositRewardFrom(
                _upline,
                msg.sender,
                uplineRewardNCTR,
                uplineRewardUSDCe
            );
        } else {
            // Send rewards to developer's wallet if _upline is not eligible for rewards
            require(
                nectarToken.transfer(devWalletAddressNCTR, uplineRewardNCTR),
                "Nectar token transfer failed!"
            );
            require(
                USDCeToken.transfer(devWalletAddressUSDCe, uplineRewardUSDCe),
                "USDC.e token transfer failed!"
            );

            emit Reward(
                devWalletAddressNCTR,
                uplineRewardNCTR,
                address(nectarToken)
            );
            emit Reward(
                devWalletAddressUSDCe,
                uplineRewardUSDCe,
                address(USDCeToken)
            );

            downlineRewardTracker[devWalletAddressNCTR]
                .depositDownlineNCTR += uplineRewardNCTR;
            downlineRewardTracker[devWalletAddressUSDCe]
                .depositDownlineeUSDCe += uplineRewardUSDCe;
            emit DepositRewardFrom(
                devWalletAddressNCTR,
                msg.sender,
                uplineRewardNCTR,
                uplineRewardUSDCe
            );
        }

        // @notice - 60% NCTR to Flower address is already in the Flower

        // Burn 20% of NCTR
        uint256 burnAmountNCTR = _calculatePercentagePart(
            realizedDepositNCTR,
            depositBurnPercNCTR
        );

        // Add 20% of NCTR and 20% of USDC.e to Liquidity pool
        uint256 lpAmountNCTR = _calculatePercentagePart(
            realizedDepositNCTR,
            depositLpPercNCTR
        );

        nectarToken.burnNectar(address(this), burnAmountNCTR + lpAmountNCTR);

        uint256 lpAmountUSDCe = _calculatePercentagePart(
            realizedDepositUSDCe,
            depositLpPercUSDCe
        );
        //   _routerAddLiquidity(lpAmountNCTR, lpAmountUSDCe);

        // Add 80% of USDC.e to Treasury address
        uint256 treasuryAmountUSDCe = _calculatePercentagePart(
            realizedDepositUSDCe,
            depositTreasuryPercUSDCe
        );
        require(
            USDCeToken.transfer(address(treasury), treasuryAmountUSDCe),
            "USDC.e token transfer failed!"
        );

        require(
            USDCeToken.transfer(address(devWalletAddressUSDCe), lpAmountUSDCe),
            "USDC.e token transfer failed!"
        );

        // Update dailyClaimAmount since DEPOSITED VALUE has change
        _updateDailyClaimAmount(msg.sender);
        if (users[msg.sender].upline != address(0)) {
            _updateDailyClaimAmount(users[msg.sender].upline);
        }
        _updateActionTime(msg.sender);
    }

    /**
     * @dev - Distribute compound rewards to the upline with Round Robin system
     */
    function _compoundRewards() private {
        uint256 compoundReward = getPendingReward(msg.sender);
        userCompoundRewards[msg.sender] += compoundReward;

        (, uint256 taxedAmountNCTR) = _calculateTax(
            compoundReward,
            compoundTax
        );

        // Burn half of the compounded NCTR amount
        // nectarToken.burnNectar(
        //     address(this),
        //     _calculatePercentagePart(taxedAmountNCTR, compoundBurnPercNCTR)
        // );

        address upline = users[msg.sender].upline;
        uint256 downlineDepth = 0;
        for (; downlineDepth < NUM_OF_TIERS; downlineDepth++) {
            // If we've reached the top of the chain or we're at the 16th upline (dev's wallet)
            if (upline == address(0) || downlineDepth == NUM_OF_TIERS - 1) {
                // Send the rewards to dev's wallet
                // uint256 restOfTaxedAmount = _calculatePercentagePart(
                //     taxedAmountNCTR,
                //     MAX_PERC - compoundBurnPercNCTR
                // );
                require(
                    nectarToken.transfer(devWalletAddressNCTR, taxedAmountNCTR),
                    "Nectar token transfer failed!"
                );
                downlineDepth = NUM_OF_TIERS - 1;

                emit Reward(
                    devWalletAddressNCTR,
                    taxedAmountNCTR,
                    address(nectarToken)
                );

                downlineRewardTracker[devWalletAddressNCTR]
                    .compoundDownlineNCTR += taxedAmountNCTR;

                emit DepositRewardFrom(
                    devWalletAddressNCTR,
                    msg.sender,
                    taxedAmountNCTR,
                    0
                );

                break;
            }

            if (
                downlineDepth >= users[msg.sender].uplineRewardTracker &&
                _getRewardEligibility(upline, downlineDepth)
            ) {
                // Calculate amount of NCTR for the swap
                uint256 forSwapNCTR = _calculatePercentagePart(
                    taxedAmountNCTR,
                    compoundUplinePercUSDCe
                );

                // Swap 5% NCTR for USDC.e and send it to upline's USDC.e wallet
                uint256 usdcBalanceBefore = USDCeToken.balanceOf(address(this));

                nectarToken.approve(address(nectarToken), forSwapNCTR);
                nectarToken.swapTokenForUsdc(forSwapNCTR, 1);

                uint256 forUplineWalletUSDCe = USDCeToken.balanceOf(
                    address(this)
                ) - usdcBalanceBefore;

                require(
                    USDCeToken.transfer(upline, forUplineWalletUSDCe),
                    "USDC.e token transfer failed!"
                );

                downlineRewardTracker[upline]
                    .compoundDownlineeUSDCe += forUplineWalletUSDCe;

                // Calculate 45% of the compound NCTR amount to deposit section
                uint256 forUplineDepositSectionNCTR = _calculatePercentagePart(
                    taxedAmountNCTR,
                    compoundUplinePercNCTR
                );
                // fix

                forUplineDepositSectionNCTR = forUplineDepositSectionNCTR / 2;
                totalDepositedNCTR += forUplineDepositSectionNCTR;

                // Check if upline is Team wallet. If true, give 25% of the upline's reward to downline
                if (
                    userDownlines[upline].length >=
                    MIN_NUM_OF_REF_FOR_TEAM_WALLET
                ) {
                    uint256 downlineRewardNCTR = _calculatePercentagePart(
                        forUplineDepositSectionNCTR,
                        teamWalletDownlineRewardPerc
                    );
                    users[msg.sender].depositsNCTR += downlineRewardNCTR;
                    forUplineDepositSectionNCTR -= downlineRewardNCTR;
                    emit TeamReward(
                        upline,
                        msg.sender,
                        downlineRewardNCTR,
                        address(nectarToken)
                    );
                }
                users[upline].depositsNCTR += forUplineDepositSectionNCTR;

                downlineRewardTracker[upline].compoundDownlineNCTR +=
                    forUplineDepositSectionNCTR *
                    2;

                emit Reward(
                    upline,
                    forUplineDepositSectionNCTR,
                    address(nectarToken)
                );
                emit Reward(upline, forUplineWalletUSDCe, address(USDCeToken));

                emit CompoundRewardFrom(
                    upline,
                    msg.sender,
                    forUplineDepositSectionNCTR * 2,
                    forUplineWalletUSDCe
                );

                break;
            }

            upline = users[upline].upline;
        }

        // Prepare tracker for next reward
        users[msg.sender].uplineRewardTracker = downlineDepth + 1;

        // Reset tracker if we've hit the end of the line
        if (users[msg.sender].uplineRewardTracker >= NUM_OF_TIERS) {
            users[msg.sender].uplineRewardTracker = 0;
        }


        // Update dailyClaimAmount since DEPOSITED VALUE has change
        _updateDailyClaimAmount(msg.sender);
        if (users[msg.sender].upline != address(0)) {
            _updateDailyClaimAmount(users[msg.sender].upline);
        }
    }

    /**
     * @dev - Distribute compound rewards to the upline with Round Robin system
     */
    function compoundRewards() external onlyBloomReferralNode {
        require(
            users[msg.sender].nextActionTime < block.timestamp,
            "Can't make two actions under 24h!"
        );

        _compoundRewards();
        
        // Update last and next possible action time
        _updateActionTime(msg.sender);
    }

    /**
     * @dev - Claim sender's daily claim amount from Bloom Treasury, calculate taxes
     */
    function claim() external onlyBloomReferralNode {
        require(
            getDepositedValue(msg.sender) + airdrops[msg.sender].airdropsGiven >
                getPendingReward(msg.sender) + users[msg.sender].payouts,
            "Can't claim if your NET DEPOSITE VALUE - daily claim amount is negative!"
        );

        uint256 maxClaim = (getDepositedValue(msg.sender) * 365) / MAX_PERC;
        require(
            users[msg.sender].payouts + getPendingReward(msg.sender) <=
                maxClaim,
            "Can't claim more than 365% of the DEPOSITED VALUE!"
        );

        require(
            users[msg.sender].nextActionTime < block.timestamp,
            "Can't make two actions under 24h!"
        );

        uint256 treasuryBalance = nectarToken.balanceOf(address(treasury));
        if (treasuryBalance < getPendingReward(msg.sender)) {
            uint256 differenceToMint = getPendingReward(msg.sender) -
                treasuryBalance;
            nectarToken.mintNectar(address(treasury), differenceToMint);
        }

        (uint256 realizedClaimNCTR, ) = _calculateTax(
            getPendingReward(msg.sender),
            claimTax
        );

        // @notice - rest of the NCTR amount is already in the Flower

        // Send NCTR tokens from Treasury to claimer's address
        treasury.withdrawNCTR(msg.sender, realizedClaimNCTR);

        totalWithdraw += getPendingReward(msg.sender);
        users[msg.sender].payouts += getPendingReward(msg.sender);

        emit Claim(msg.sender, getPendingReward(msg.sender));

        // Update last and next possible action time
        _updateActionTime(msg.sender);
    }

    /**
     * @dev - Airdrop to multiple addresses and save airdrops to Treasury. Update _receivers deposit section
     * @param _receivers - Addresses to which airdrop would go
     * @param _airdrops - Amounts to airdrop to receivers
     * @notice - _receivers and _amounts indexes must match
     */
    function airdrop(address[] memory _receivers, uint256[] memory _airdrops)
        external
        onlyBloomReferralNode
    {
        require(
            _receivers.length == _airdrops.length,
            "Receivers and airdrops array lengths must be equal!"
        );

        uint256 sumOfAirdrops = 0;
        for (uint256 i = 0; i < _airdrops.length; i++) {
            require(_airdrops[i] > 0, "Can't airdrop amount equal to zero!");
            require(
                users[_receivers[i]].upline != address(0) ||
                    _receivers[i] == owner(),
                "Can't airdrop to someone that's not in the Bloom Referral system!"
            );

            sumOfAirdrops += _airdrops[i];

            // Update receiver's stats
            airdrops[_receivers[i]].airdropsReceived += _airdrops[i];
            _updateDailyClaimAmount(_receivers[i]);
        }

        require(
            nectarToken.transferFrom(
                msg.sender,
                address(treasury),
                sumOfAirdrops
            ),
            "NCTR token transfer failed!"
        );

        // Update sender's stats
        airdrops[msg.sender].airdropsGiven += sumOfAirdrops;
        airdrops[msg.sender].lastAirdropTime = block.timestamp;
        totalAirdrops += sumOfAirdrops;

        emit AirdropNCTR(msg.sender, _receivers, _airdrops, block.timestamp);
    }

    function setRouterAddress(address _router) external onlyOwner {
        require(_router != address(0), "invalid address");

        router = IBloomexRouter02(_router);
    }
}
