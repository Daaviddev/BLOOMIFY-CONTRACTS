import { expect } from "chai";
import { Signer } from "ethers";
import { ethers, network } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { deployContract, deployUpgradeableContract } from "../scripts/utils";
import {
  Nectar,
  BloomsManagerUpgradeable,
  Whitelist,
  Router,
  USDC,
  BloomNFT,
  TreasuryUpgradeable,
} from "../typechain";

describe("BloomsManager", function () {
  // Accounts
  let accounts: SignerWithAddress[];
  let owner: SignerWithAddress;

  const initialNectarSupply = ethers.utils.parseEther("1000");
  const rewardPerDay = 34724;

  // Contracts
  let bloomsManager: BloomsManagerUpgradeable,
    nectar: Nectar,
    whitelist: Whitelist,
    router: Router,
    usdc: USDC,
    treasury: TreasuryUpgradeable,
    bloomNFT: BloomNFT;

  // block.timestamp
  const getCurrentBlockTime = async () => {
    const blockNumber = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumber);

    return blockBefore.timestamp;
  };

  beforeEach(async () => {
    [owner, ...accounts] = await ethers.getSigners();

    nectar = await deployUpgradeableContract<Nectar>("Nectar", [
      initialNectarSupply,
    ]);

    usdc = await deployUpgradeableContract<USDC>("USDC");

    bloomNFT = await deployUpgradeableContract<BloomNFT>("BloomNFT", [
      "https://",
    ]);

    router = await deployContract<Router>("Router");

    treasury = await deployUpgradeableContract<TreasuryUpgradeable>(
      "TreasuryUpgradeable",
      [nectar.address, usdc.address]
    );

    whitelist = await deployUpgradeableContract<Whitelist>(
      "Whitelist",
      undefined,
      "__Whitelist_init"
    );

    bloomsManager = await deployUpgradeableContract<BloomsManagerUpgradeable>(
      "BloomsManagerUpgradeable",
      [
        accounts[1].address,
        '0x0000000000000000000000000000000000000000',
        treasury.address,
        usdc.address,
        nectar.address,
        bloomNFT.address,
        whitelist.address,
        rewardPerDay,
      ]
    );

    await bloomsManager.setRewardsPool(accounts[1].address);
    await nectar.setRewardsPool(accounts[1].address);

    await bloomsManager.setDevWallet(accounts[2].address);
    await bloomsManager.setPairAddress(router.address);

    await usdc.transfer(router.address, 10 * (10 ** 6));
    await nectar.mintNectar(router.address, ethers.utils.parseEther('10'));

    await nectar.setBloomNodes(bloomsManager.address);
    await bloomNFT.setBloomNodes(bloomsManager.address);
  });

  it("Should successfully create a node with $NCTR and deposit more tokens into it", async () => {
    const approvalAmount = ethers.utils.parseEther("10");
    const minimumNodePrice = 10000;
    const addValueAmount = 1000000;

    expect(
      (await nectar.balanceOf(owner.address)).toString() ==
        initialNectarSupply.toString()
    ).to.be.true;

    await bloomsManager.setNodeMinPriceNctr(minimumNodePrice);

    expect(
      (await bloomsManager.creationMinPriceNctr()).toString() ==
        minimumNodePrice.toString()
    ).to.be.true;

    // Expect the transaction to throw
    await expect(
      bloomsManager.createBloomWithNectar("Bloom", minimumNodePrice - 1)
    ).to.be.revertedWith("2");

    // Add address to whitelist so it can create a node with $NCTR
    await whitelist.addToWhitelist([owner.address]);
    // Necessary approval
    await nectar.approve(bloomsManager.address, approvalAmount);
    await nectar.transfer(bloomsManager.address, approvalAmount);

    // Deposit and mint bloom node with nectar
    await bloomsManager.createBloomWithNectar("Bloom", minimumNodePrice);

    expect((await bloomsManager.totalValueLocked()).eq(minimumNodePrice)).to.be
      .true;
    expect((await bloomNFT.balanceOf(owner.address)).eq(1)).to.be.true;
    expect((await bloomNFT.ownerOf(1)) == owner.address).to.be.true;

    // addValue function test
    const totalValueLockedBefore = await bloomsManager.totalValueLocked();
    await bloomsManager.addValue(1, addValueAmount);
    const totalValueLockedAfter = await bloomsManager.totalValueLocked();

    // Expect addValueAmount to be equal to the difference between total locked values
    // Since this is a $NCTR deposit no calculations should have been made
    expect(totalValueLockedBefore.add(addValueAmount).eq(totalValueLockedAfter))
      .to.be.true;
  });

  it("Should successfully create a node with $USDC.e and deposit more tokens into it", async () => {
    const approvalAmount = ethers.utils.parseEther("10");
    const minimumNodePrice = 10000;
    const addValueAmount = 1000000;

    const initialSupply = ethers.utils.parseEther("1000");

    expect(
      (await nectar.balanceOf(owner.address)).toString() ==
        initialSupply.toString()
    ).to.be.true;

    await bloomsManager.setNodeMinPriceUsdc(minimumNodePrice);
    expect(
      (await bloomsManager.creationMinPriceUsdc()).toString() ==
        minimumNodePrice.toString()
    ).to.be.true;

    // Expect the transaction to throw
    await expect(
      bloomsManager.createBloomWithUsdc("Bloom", minimumNodePrice - 1)
    ).to.be.revertedWith("2");

    // Since we're using a mock contract as a router,
    // bloomsManager contract needs to have an initial balance of $NCTR
    // in order to be able to burn and transfer the required amounts
    await nectar.transfer(bloomsManager.address, approvalAmount);

    // Necessary approval
    await usdc.approve(bloomsManager.address, approvalAmount);
    await nectar.approve(bloomsManager.address, approvalAmount);

    // Deposit and mint bloom node with $USDC.e
    await bloomsManager.createBloomWithUsdc("Bloom", minimumNodePrice);
    
    console.log((await bloomsManager.getBloomsByIds([1]))[0]['pendingRewards'])
    /**
     * DISCLAIMER:
     * Since we're using a mock contract for testing, and amount of $USDC.e reserves in the pool is less than $NCTR ($USDC.e is worth more),
     * the getAmountOut() function inside _deposit function, which calculates $NCTR value of $USDC.e deposits, calculates the deposited
     * value (in this case minimumNodePrice) to be greater than the actual deposit amount.
     * Once the contract is connected to an actual router with actual liquidity, the function will calculate the real value in $NCTR.
     */
    expect((await bloomsManager.totalValueLocked()).gt(minimumNodePrice)).to.be
      .true;
    expect((await bloomNFT.balanceOf(owner.address)).eq(1)).to.be.true;
    expect((await bloomNFT.ownerOf(1)) == owner.address).to.be.true;

    // addValue function test
    const totalValueLockedBefore = await bloomsManager.totalValueLocked();
    
    await bloomsManager.addValue(1, addValueAmount);

    const totalValueLockedAfter = await bloomsManager.totalValueLocked();

    expect(totalValueLockedBefore.lt(totalValueLockedAfter)).to.be.true;
  });

  it("Should successfully rename a BloomNode", async () => {
    const rewardPerDay = 34724;
    const approvalAmount = ethers.utils.parseEther("10");
    const minimumNodePrice = 10000;

    const initialSupply = ethers.utils.parseEther("1000");

    expect(
      (await nectar.balanceOf(owner.address)).toString() ==
        initialSupply.toString()
    ).to.be.true;

    // Since we're using a mock contract as a router,
    // bloomsManager contract needs to have an initial balance of $NCTR
    // in order to be able to burn and transfer the required amounts
    await nectar.transfer(bloomsManager.address, approvalAmount);

    // Setting minimumNodePrice
    await bloomsManager.setNodeMinPriceUsdc(minimumNodePrice);
    expect(
      (await bloomsManager.creationMinPriceUsdc()).toString() ==
        minimumNodePrice.toString()
    ).to.be.true;

    // Necessary approval
    await usdc.approve(bloomsManager.address, approvalAmount);

    // Deposit and mint bloom node with $USDC.e
    await bloomsManager.createBloomWithUsdc("Bloom", minimumNodePrice);

    expect((await bloomsManager.totalValueLocked()).gt(minimumNodePrice)).to.be
      .true;
    expect((await bloomNFT.balanceOf(owner.address)).toString() == "1").to.be
      .true;
    expect((await bloomNFT.ownerOf(1)) == owner.address).to.be.true;

    // Renaming Bloom, then checking if the Rename event was triggered
    await bloomsManager.renameBloom(1, "BetterBloom");

    // expect Bloom.name to equal BetterBloom
    const bloomEntity = await bloomsManager.getBloomsByIds([1]);
    expect(bloomEntity[0][0].name == "BetterBloom").to.be.true;
  });

  it("Should successfully test autoCompound and autoClaim functions", async () => {
    const rewardPerDay = 34724;
    const approvalAmount = ethers.utils.parseEther("10");
    const minimumNodePrice = 10000;
    const lockPeriod = 6 * 86400;

    const initialSupply = ethers.utils.parseEther("1000");

    expect(
      (await nectar.balanceOf(owner.address)).toString() ==
        initialSupply.toString()
    ).to.be.true;

    // BloomsManager contract needs to have an initial balance of $NCTR to be able to burn fees
    await nectar.transfer(bloomsManager.address, approvalAmount);

    // Setting minimumNodePrice
    await bloomsManager.setNodeMinPriceNctr(minimumNodePrice);
    expect(
      (await bloomsManager.creationMinPriceNctr()).toString() ==
        minimumNodePrice.toString()
    ).to.be.true;

    // Necessary approval
    await nectar.approve(bloomsManager.address, approvalAmount);

    // Deposit and mint bloom node with $NCTR
    await whitelist.addToWhitelist([owner.address]);
    await bloomsManager.createBloomWithNectar("Bloom", minimumNodePrice);
    await bloomsManager.createBloomWithNectar("Bloom", minimumNodePrice);
    await bloomsManager.createBloomWithNectar("Bloom", minimumNodePrice);

    expect((await bloomNFT.balanceOf(owner.address)).toString() > "1").to.be
      .true;

    // Compound function
    const currentTime = (await getCurrentBlockTime()) + 2;

    await bloomsManager.startAutoCompounding(1, lockPeriod);
    await bloomsManager.startAutoCompounding(2, lockPeriod);
    await bloomsManager.startAutoCompounding(3, lockPeriod);

    // Increase block.timestamp (2 days = 172800 seconds)
    await network.provider.send("evm_increaseTime", [172800]);
    await network.provider.send("evm_mine");

    const totalValueLockedBefore = await bloomsManager.totalValueLocked();
    await bloomsManager.autoCompound(3);
    const totalValueLockedAfter = await bloomsManager.totalValueLocked();

    expect(totalValueLockedAfter.gt(totalValueLockedBefore)).to.be.true;

    await network.provider.send("evm_increaseTime", [lockPeriod + 100]);
    await network.provider.send("evm_mine");

    await bloomsManager.autoCompound(3);

    const nctrBalanceBefore = await nectar.balanceOf(owner.address);

    await bloomsManager.autoClaim(3);
    expect((await nectar.balanceOf(owner.address)).gt(nctrBalanceBefore)).to.be
      .true;
  });

  it("Should successfully test emergencyClaim function", async () => {
    const rewardPerDay = 34724;
    const approvalAmount = ethers.utils.parseEther("10");
    const minimumNodePrice = 10000;
    const lockPeriod = 13 * 86400;
    const week = 7 * 86400;
    const day = 86400;

    const initialSupply = ethers.utils.parseEther("1000");

    // Since we're using a mock contract as a router,
    // bloomsManager contract needs to have an initial balance of $NCTR
    // in order to be able to burn and transfer the required amounts
    await nectar.transfer(bloomsManager.address, approvalAmount);

    // Setting minimumNodePrice
    await bloomsManager.setNodeMinPriceNctr(minimumNodePrice);
    expect(
      (await bloomsManager.creationMinPriceNctr()).toString() ==
        minimumNodePrice.toString()
    ).to.be.true;

    // Necessary approval
    await nectar.approve(bloomsManager.address, approvalAmount);

    // Deposit and mint bloom node
    await whitelist.addToWhitelist([owner.address]);
    await bloomsManager.createBloomWithNectar("Bloom", minimumNodePrice);
    await bloomsManager.createBloomWithNectar("Bloom", minimumNodePrice);
    await bloomsManager.createBloomWithNectar("Bloom", minimumNodePrice);
    await bloomsManager.createBloomWithNectar("Bloom", minimumNodePrice);
    await bloomsManager.createBloomWithNectar("Bloom", minimumNodePrice);
    await bloomsManager.createBloomWithNectar("Bloom", minimumNodePrice);

    expect((await bloomNFT.balanceOf(owner.address)).toString() > "1").to.be
      .true;

    // Compound function
    const currentTime = (await getCurrentBlockTime()) + 2;

    await bloomsManager.startAutoCompounding(1, lockPeriod);
    await bloomsManager.startAutoCompounding(2, lockPeriod);
    await bloomsManager.startAutoCompounding(3, lockPeriod);
    await bloomsManager.startAutoCompounding(4, lockPeriod);
    await bloomsManager.startAutoCompounding(5, lockPeriod);
    await bloomsManager.startAutoCompounding(6, lockPeriod);

    // Increase block.timestamp (2 days = 172800 seconds)
    await network.provider.send("evm_increaseTime", [day]);
    await network.provider.send("evm_mine");

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Reason behind the six blocks of emergency claims is to check if the emergencyFee is getting increased //
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////

    // Emergency claim block1
    const nctrBalanceBefore1 = await nectar.balanceOf(owner.address);
    await bloomsManager.emergencyClaim(1);
    expect((await nectar.balanceOf(owner.address)).gt(nctrBalanceBefore1)).to.be
      .true;
    const nctrBalanceIncreaseAfter1 = (
      await nectar.balanceOf(owner.address)
    ).sub(nctrBalanceBefore1);
    console.log(
      "Reward after the first emergencyClaim in a week:",
      nctrBalanceIncreaseAfter1.toString()
    );

    // Emergency claim block2
    const nctrBalanceBefore2 = await nectar.balanceOf(owner.address);
    await bloomsManager.emergencyClaim(2);
    expect((await nectar.balanceOf(owner.address)).gt(nctrBalanceBefore2)).to.be
      .true;
    const nctrBalanceIncreaseAfter2 = (
      await nectar.balanceOf(owner.address)
    ).sub(nctrBalanceBefore2);
    // Expect to receive less rewards than the previous emergencyClaim
    expect(nctrBalanceIncreaseAfter2.lt(nctrBalanceIncreaseAfter1)).to.be.true;

    // Emergency claim block3
    const nctrBalanceBefore3 = await nectar.balanceOf(owner.address);
    await bloomsManager.emergencyClaim(3);
    expect((await nectar.balanceOf(owner.address)).gt(nctrBalanceBefore3)).to.be
      .true;
    const nctrBalanceIncreaseAfter3 = (
      await nectar.balanceOf(owner.address)
    ).sub(nctrBalanceBefore3);
    // Expect to receive less rewards than the previous emergencyClaim
    expect(nctrBalanceIncreaseAfter3.lt(nctrBalanceIncreaseAfter2)).to.be.true;

    // Emergency claim block4
    const nctrBalanceBefore4 = await nectar.balanceOf(owner.address);
    await bloomsManager.emergencyClaim(4);
    expect((await nectar.balanceOf(owner.address)).gt(nctrBalanceBefore4)).to.be
      .true;
    const nctrBalanceIncreaseAfter4 = (
      await nectar.balanceOf(owner.address)
    ).sub(nctrBalanceBefore4);
    // Expect to receive less rewards than the previous emergencyClaim
    expect(nctrBalanceIncreaseAfter4.lt(nctrBalanceIncreaseAfter3)).to.be.true;

    // Emergency claim block5
    const nctrBalanceBefore5 = await nectar.balanceOf(owner.address);
    await bloomsManager.emergencyClaim(5);
    expect((await nectar.balanceOf(owner.address)).gt(nctrBalanceBefore5)).to.be
      .true;
    const nctrBalanceIncreaseAfter5 = (
      await nectar.balanceOf(owner.address)
    ).sub(nctrBalanceBefore5);
    // Expect to receive less rewards than the previous emergencyClaim
    expect(nctrBalanceIncreaseAfter5.lt(nctrBalanceIncreaseAfter4)).to.be.true;

    // Emergency claim block6
    const nctrBalanceBefore6 = await nectar.balanceOf(owner.address);
    await bloomsManager.emergencyClaim(6);
    expect((await nectar.balanceOf(owner.address)).gt(nctrBalanceBefore6)).to.be
      .true;
    const nctrBalanceIncreaseAfter6 = (
      await nectar.balanceOf(owner.address)
    ).sub(nctrBalanceBefore6);
    // Expect to receive equal rewards as previous emegencyClaim because the max. emergencyFee is 90%
    expect(nctrBalanceIncreaseAfter6.eq(nctrBalanceIncreaseAfter5)).to.be.true;

    // Check if _isProcessable throws
    await expect(
      bloomsManager.startAutoCompounding(1, lockPeriod)
    ).to.be.revertedWith("14");

    // Start autoCompounding again
    await network.provider.send("evm_increaseTime", [2 * day + week]);
    await network.provider.send("evm_mine");

    await bloomsManager.startAutoCompounding(1, lockPeriod);

    // Increase time to a week after
    await network.provider.send("evm_increaseTime", [3 * day + week]);
    await network.provider.send("evm_mine");

    // Emergency claim block after a week
    const nctrBalanceBefore = await nectar.balanceOf(owner.address);
    await bloomsManager.emergencyClaim(1);
    expect((await nectar.balanceOf(owner.address)).gt(nctrBalanceBefore)).to.be
      .true;
    const nctrBalanceIncreaseAfter = (
      await nectar.balanceOf(owner.address)
    ).sub(nctrBalanceBefore);


    // The emergencyClaim rewards after one claim need to be the same after a week since the emergencyStatus resets
    //expect(nctrBalanceIncreaseAfter.eq(nctrBalanceIncreaseAfter1)).to.be.true;
  });

  it("Should successfully increase reward multiplier due to length of autocompounding lock period", async () => {
    const rewardPerDay = 34724;
    const approvalAmount = ethers.utils.parseEther("10");
    const minimumNodePrice = 10000;
    const lockPeriod1 = 6 * 86400;
    const lockPeriod2 = 13 * 86400;
    const lockPeriod3 = 27 * 86400;

    const day = 86400;

    const initialSupply = ethers.utils.parseEther("1000");

    expect(
      (await nectar.balanceOf(owner.address)).toString() ==
        initialSupply.toString()
    ).to.be.true;

    const tierLevel1 = await bloomsManager.tierLevel([0]);
    const tierLevel2 = (await bloomsManager.tierLevel([0])) + 15000;
    const tierLevel3 = (await bloomsManager.tierLevel([0])) + 25000;
    // Since we're using a mock contract as a router,
    // bloomsManager contract needs to have an initial balance of $NCTR
    // in order to be able to burn and transfer the required amounts
    await nectar.transfer(bloomsManager.address, approvalAmount);

    // Setting minimumNodePrice
    await bloomsManager.setNodeMinPriceNctr(minimumNodePrice);
    expect(
      (await bloomsManager.creationMinPriceNctr()).toString() ==
        minimumNodePrice.toString()
    ).to.be.true;

    // Necessary approval
    await nectar.approve(bloomsManager.address, approvalAmount);

    // Deposit and mint bloom node
    await whitelist.addToWhitelist([owner.address]);
    await bloomsManager.createBloomWithNectar("Bloom", minimumNodePrice);

    expect((await bloomNFT.balanceOf(owner.address)).toString() == "1").to.be
      .true;

    const currentTime = (await getCurrentBlockTime()) + 2;

    // First block
    await bloomsManager.startAutoCompounding(1, lockPeriod1);
    const bloomStats1 = await bloomsManager.getBloomsByIds([1]);
    expect(bloomStats1[0][0].rewardMult.eq(tierLevel1)).to.be.true;

    // Increase time and reset rewardMult
    await ethers.provider.send("evm_mine", [currentTime + day]);
    await bloomsManager.emergencyClaim(1);
    await ethers.provider.send("evm_mine", [currentTime + 2 * day]);

    // Second block
    await bloomsManager.startAutoCompounding(1, lockPeriod2);
    const bloomStats2 = await bloomsManager.getBloomsByIds([1]);
    expect(bloomStats2[0][0].rewardMult.eq(tierLevel2)).to.be.true;

    // Increase time and reset rewardMult
    await ethers.provider.send("evm_mine", [currentTime + 3 * day]);
    await bloomsManager.emergencyClaim(1);
    await ethers.provider.send("evm_mine", [currentTime + 4 * day]);

    // Third block
    await bloomsManager.startAutoCompounding(1, lockPeriod3);
    const bloomStats3 = await bloomsManager.getBloomsByIds([1]);
    expect(bloomStats3[0][0].rewardMult.eq(tierLevel3)).to.be.true;
  });


  it("72h max producing", async () => {
    const approvalAmount = ethers.utils.parseEther("10");
    const minimumNodePrice = 10000;
    const addValueAmount = 1000000;
    const day = 86400;

    await bloomsManager.setNodeMinPriceNctr(minimumNodePrice);

    // Add address to whitelist so it can create a node with $NCTR
    await whitelist.addToWhitelist([owner.address]);
    // Necessary approval
    await nectar.approve(bloomsManager.address, approvalAmount);
    await nectar.transfer(bloomsManager.address, approvalAmount);

    // Deposit and mint bloom node with nectar
    await bloomsManager.createBloomWithNectar("Bloom", minimumNodePrice);

    let predision = await bloomsManager.calculateTotalDailyEmission()

    console.log(predision)

    await network.provider.send("evm_increaseTime", [1 * day]);
    await network.provider.send("evm_mine");

    console.log((await bloomsManager.getBloomsByIds([1]))[0]['pendingRewards'])


  });

});
