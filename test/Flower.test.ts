import { BigNumber } from "ethers";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { deployContract, deployUpgradeableContract } from "../scripts/utils";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Signer } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import {
  Nectar,
  Router,
  USDC,
  TreasuryUpgradeable,
  FlowerUpgradeable,
  BloomifyNFT
} from "../typechain";

const NEW_TAX = 69;
const MAX_PERCENTAGE = 100;
const MIN_AMOUNT = 1;
const INITIAL_OWNER_AMOUNT = 1000;
const APR_FOR_REGULAR_WALLETS: number = 5;
const APR_FOR_TEAM_WALLETS: number = 10;

const initialNectarSupply = ethers.utils.parseEther("1000");
  // Contracts

describe("Flower", function() {
  let flower: FlowerUpgradeable;
  let treasury: TreasuryUpgradeable;
  let nectar: Nectar;
  let usdce: USDC;

  let router: Router;
  let tierNFT: BloomifyNFT;

  let devWalletNCTR: SignerWithAddress;
  let devWalletUSDCe: SignerWithAddress;
  let owner: SignerWithAddress;
  let accounts: SignerWithAddress[];

  beforeEach(async () => {
    [owner, devWalletNCTR, devWalletUSDCe, ...accounts] = await ethers.getSigners();

    nectar = await deployUpgradeableContract<Nectar>("Nectar", [
      initialNectarSupply,
    ]);

    await nectar.setRewardsPool(accounts[1].address);
    
    usdce = await deployUpgradeableContract<USDC>("USDC");

    router = await deployContract<Router>("Router");

    await nectar.setLiquidityManager(router.address)

    tierNFT = await deployUpgradeableContract<BloomifyNFT>("BloomifyNFT", ['', usdce.address]);

    treasury = await deployUpgradeableContract("TreasuryUpgradeable", [
      nectar.address,
      usdce.address,
    ]);

    flower = await deployUpgradeableContract("FlowerUpgradeable", [
      tierNFT.address,
      nectar.address,
      usdce.address,
      treasury.address,
      router.address,
      devWalletNCTR.address,
      devWalletUSDCe.address,
      devWalletNCTR.address,
    ]);
  });



  describe("Initialization", () => {
    it("Should successfully initialize the owner", async () => {
      expect(await flower.owner()).to.equal(owner.address);
    });

    it("Should have only one user after initialization", async () => {
      expect((await flower.totalUsers()).toNumber()).to.equal(1);
    });
  });

  describe("Management functions", () => {
    describe("Deposit tax", () => {
      it("Should update if called only by owner", async () => {
        await flower.updateDepositTax(NEW_TAX);
        expect((await flower.depositTax()).toNumber()).to.be.equal(NEW_TAX);
      });

      it("Should revert if called by non-owner", async () => {
        await expect(
          flower.connect(accounts[0]).updateDepositTax(NEW_TAX)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe("Deposit distribution percentages", () => {
      let newDepositBurnPercNCTR: number;
      let newDepositFlowerPercNCTR: number;
      let newDepositLpPercNCTR: number;
      let newDepositLpPercUSDCe: number;
      let newDepositTreasuryPercUSDCe: number;

      beforeEach(async () => {
        newDepositBurnPercNCTR = MAX_PERCENTAGE / 4;
        newDepositFlowerPercNCTR = newDepositBurnPercNCTR;
        newDepositLpPercNCTR =
          MAX_PERCENTAGE - newDepositBurnPercNCTR - newDepositFlowerPercNCTR;
        newDepositLpPercUSDCe = newDepositLpPercNCTR;
        newDepositTreasuryPercUSDCe = MAX_PERCENTAGE - newDepositLpPercUSDCe;
      });

      it("Should update if called by owner with correct distribution", async () => {
        await expect(
          flower.updateDepositDistributionPercentages(
            newDepositBurnPercNCTR,
            newDepositFlowerPercNCTR,
            newDepositLpPercNCTR,
            newDepositLpPercUSDCe,
            newDepositTreasuryPercUSDCe
          )
        ).to.not.be.reverted;
      });

      it("Should revert if called by non-owner with correct distribution", async () => {
        await expect(
          flower
            .connect(accounts[0])
            .updateDepositDistributionPercentages(
              newDepositBurnPercNCTR,
              newDepositFlowerPercNCTR,
              newDepositLpPercNCTR,
              newDepositLpPercUSDCe,
              newDepositTreasuryPercUSDCe
            )
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("Should revert if called by owner with incorrect NCTR distribution", async () => {
        newDepositBurnPercNCTR += 1;
        await expect(
          flower.updateDepositDistributionPercentages(
            newDepositBurnPercNCTR,
            newDepositFlowerPercNCTR,
            newDepositLpPercNCTR,
            newDepositLpPercUSDCe,
            newDepositTreasuryPercUSDCe
          )
        ).to.be.revertedWith(
          "Nectar deposit percentages not summing up to 100!"
        );

        newDepositBurnPercNCTR -= 1;
        newDepositFlowerPercNCTR += 1;
        await expect(
          flower.updateDepositDistributionPercentages(
            newDepositBurnPercNCTR,
            newDepositFlowerPercNCTR,
            newDepositLpPercNCTR,
            newDepositLpPercUSDCe,
            newDepositTreasuryPercUSDCe
          )
        ).to.be.revertedWith(
          "Nectar deposit percentages not summing up to 100!"
        );

        newDepositFlowerPercNCTR -= 1;
        newDepositLpPercNCTR += 1;
        await expect(
          flower.updateDepositDistributionPercentages(
            newDepositBurnPercNCTR,
            newDepositFlowerPercNCTR,
            newDepositLpPercNCTR,
            newDepositLpPercUSDCe,
            newDepositTreasuryPercUSDCe
          )
        ).to.be.revertedWith(
          "Nectar deposit percentages not summing up to 100!"
        );
      });

      it("Should revert if called by owner with incorrect USDC.e distribution", async () => {
        newDepositLpPercUSDCe += 1;
        await expect(
          flower.updateDepositDistributionPercentages(
            newDepositBurnPercNCTR,
            newDepositFlowerPercNCTR,
            newDepositLpPercNCTR,
            newDepositLpPercUSDCe,
            newDepositTreasuryPercUSDCe
          )
        ).to.be.revertedWith(
          "USDC.e deposit percentages not summing up to 100!"
        );

        newDepositLpPercUSDCe -= 1;
        newDepositTreasuryPercUSDCe += 1;
        await expect(
          flower.updateDepositDistributionPercentages(
            newDepositBurnPercNCTR,
            newDepositFlowerPercNCTR,
            newDepositLpPercNCTR,
            newDepositLpPercUSDCe,
            newDepositTreasuryPercUSDCe
          )
        ).to.be.revertedWith(
          "USDC.e deposit percentages not summing up to 100!"
        );
      });

      it("Should revert if called by owner with incorrect NCTR/USDC.e LP distribution", async () => {
        newDepositBurnPercNCTR -= 1;
        newDepositLpPercNCTR += 1;

        await expect(
          flower.updateDepositDistributionPercentages(
            newDepositBurnPercNCTR,
            newDepositFlowerPercNCTR,
            newDepositLpPercNCTR,
            newDepositLpPercUSDCe,
            newDepositTreasuryPercUSDCe
          )
        ).to.be.revertedWith("Different LP percentages!");
      });
    });

    describe("Compound tax", () => {
      it("Should update if called only by owner", async () => {
        await flower.updateCompoundTax(NEW_TAX);
        expect((await flower.compoundTax()).toNumber()).to.be.equal(NEW_TAX);
      });

      it("Should revert if called by non-owner", async () => {
        await expect(
          flower.connect(accounts[0]).updateCompoundTax(NEW_TAX)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe("Compound distribution percentages", () => {
      let newCompoundBurnPercNCTR: number;
      let newCompoundUplinePercNCTR: number;
      let newCompoundUplinePercUSDCe: number;

      beforeEach(async () => {
        newCompoundBurnPercNCTR = Math.floor(MAX_PERCENTAGE / 3);
        newCompoundUplinePercNCTR = Math.floor(MAX_PERCENTAGE / 3);
        newCompoundUplinePercUSDCe = Math.ceil(MAX_PERCENTAGE / 3);
      });

      it("Should update if called by owner with correct distribution", async () => {
        await expect(
          flower.updateCompoundDistributionPercentages(
            newCompoundBurnPercNCTR,
            newCompoundUplinePercNCTR,
            newCompoundUplinePercUSDCe
          )
        ).to.not.be.reverted;
      });

      it("Should revert if called by non-owner with correct distribution", async () => {
        await expect(
          flower
            .connect(accounts[0])
            .updateCompoundDistributionPercentages(
              newCompoundBurnPercNCTR,
              newCompoundUplinePercNCTR,
              newCompoundUplinePercUSDCe
            )
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("Should revert if called by owner with incorrect distribution", async () => {
        newCompoundBurnPercNCTR += 1;
        await expect(
          flower.updateCompoundDistributionPercentages(
            newCompoundBurnPercNCTR,
            newCompoundUplinePercNCTR,
            newCompoundUplinePercUSDCe
          )
        ).to.be.revertedWith("Compound percentages not summing up to 100!");

        newCompoundBurnPercNCTR -= 1;
        newCompoundUplinePercNCTR += 1;
        await expect(
          flower.updateCompoundDistributionPercentages(
            newCompoundBurnPercNCTR,
            newCompoundUplinePercNCTR,
            newCompoundUplinePercUSDCe
          )
        ).to.be.revertedWith("Compound percentages not summing up to 100!");

        newCompoundUplinePercNCTR -= 1;
        newCompoundUplinePercUSDCe += 1;
        await expect(
          flower.updateCompoundDistributionPercentages(
            newCompoundBurnPercNCTR,
            newCompoundUplinePercNCTR,
            newCompoundUplinePercUSDCe
          )
        ).to.be.revertedWith("Compound percentages not summing up to 100!");
      });
    });

    describe("Claim tax", () => {
      it("Should update if called only by owner", async () => {
        await flower.updateClaimTax(NEW_TAX);
        expect((await flower.claimTax()).toNumber()).to.be.equal(NEW_TAX);
      });

      it("Should revert if called by non-owner", async () => {
        await expect(
          flower.connect(accounts[0]).updateClaimTax(NEW_TAX)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe("Team Wallet downline reward percentage", () => {
      it("Should update if called only by owner", async () => {
        await flower.updateTeamWalletDownlineRewardPerc(NEW_TAX);
        expect(
          (await flower.teamWalletDownlineRewardPerc()).toNumber()
        ).to.be.equal(NEW_TAX);
      });

      it("Should revert if called by non-owner", async () => {
        await expect(
          flower
            .connect(accounts[0])
            .updateTeamWalletDownlineRewardPerc(NEW_TAX)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("Public functions", () => {
    let uplineAddress: string;
    let depositAmount: BigNumber;
    let depositRewardAmount: BigNumber;
    let maxNumOfDeposits: number;
    let simpleDeposit: Function;

    const MAX_NUM_OF_OWNER_REFERRALS: number = 15;
    const MIN_NUM_OF_REF_FOR_TEAM_WALLET: number = 5;

    beforeEach(async () => {
      // assume $NCTR:$UDSC.e ratio is 1:1
      uplineAddress = owner.address;
      depositAmount = BigNumber.from(MIN_AMOUNT * (10 ** 6));
      depositRewardAmount = depositAmount
        .div(2)
        .mul(await flower.depositTax())
        .div(MAX_PERCENTAGE);
      maxNumOfDeposits = 2;

      await usdce.transfer(
        accounts[0].address,
        depositAmount.mul(maxNumOfDeposits)
      );

      await usdce
        .connect(accounts[0])
        .approve(flower.address, depositAmount.mul(maxNumOfDeposits));
      await usdce.transfer(flower.address, depositAmount.mul(maxNumOfDeposits));
      
      await nectar.transfer(
        flower.address,
        depositAmount.mul(maxNumOfDeposits)
      );

      simpleDeposit = async (addr: SignerWithAddress) => {
        await usdce.transfer(addr.address, depositAmount.mul(maxNumOfDeposits));
        await usdce
          .connect(addr)
          .approve(flower.address, depositAmount.mul(maxNumOfDeposits));

        await usdce.transfer(
          flower.address,
          depositAmount.mul(maxNumOfDeposits)
        );
        await nectar.transfer(
          flower.address,
          depositAmount.mul(maxNumOfDeposits)
        );

        await flower.connect(addr).deposit(depositAmount, uplineAddress);
      };
    });

    describe("Check user's DEPOSIT VALUE", () => {
      it("Should revert if user is zero address", async () => {
        await expect(flower.getDepositedValue(ethers.constants.AddressZero)).to
          .be.revertedWith("Zero address!");
      });
      it("Should return DEPOSITED VALUE for given user", async () => {
        await simpleDeposit(owner);
        let expectedNCTRDeposited: BigNumber = (
          await flower.users(owner.address)
        ).depositsNCTR
        let expectedAirdropsReceived: BigNumber = (
          await flower.airdrops(owner.address)
        ).airdropsReceived

        let expectedDepositedValue: BigNumber = expectedNCTRDeposited.add(expectedAirdropsReceived);

        // Test
        expect(await flower.getDepositedValue(owner.address)).to.be.equal(expectedDepositedValue);
      });
    });

    describe("Deposit", () => {
      it("Should revert if amount for deposit is not greater than 0", async () => {
        await expect(
          flower
            .connect(accounts[0])
            .deposit(BigNumber.from("0"), owner.address)
        ).to.be.reverted;
      });

      it("Should revert if given upline is zero address", async () => {
        await expect(
          flower
            .connect(accounts[0])
            .deposit(depositAmount, ethers.constants.AddressZero)
        ).to.be.revertedWith("Zero address!");
      });

      it("Should revert if upline is the owner and it already has 15 referrals", async () => {
        // Make sure that the owner has 15 referrals before checking this test
        let i;
        for (i = 0; i < MAX_NUM_OF_OWNER_REFERRALS; i++) {
          await simpleDeposit(accounts[i]);
        }

        // Test
        await expect(simpleDeposit(accounts[i])).to.be.revertedWith("Owner can have max 15 referrals!");
      });

      it("Should revert if upline is not the node in Bloom Referral", async () => {
        await expect(flower.connect(accounts[0]).deposit(depositAmount, accounts[1].address)
        ).to.be.revertedWith("Given upline is not node in Bloom Referral or it's not the owner");
      });

      it("Should revert if deposit in USDC.e fails", async () => {
        await expect(
          flower
            .connect(accounts[0])
            .deposit(depositAmount.mul(maxNumOfDeposits).add(1), owner.address)
        ).to.be.reverted;
      });

      it("Team should have 0.5% APR if their upline has less than 5 downlines", async () => {
        for (let i = 0; i < MIN_NUM_OF_REF_FOR_TEAM_WALLET - 1; i++) {
          await simpleDeposit(accounts[i]);
        }

        // Test
        expect((await flower.users(owner.address)).APR).to.be.equal(APR_FOR_REGULAR_WALLETS);
        for (let i = 0; i < MIN_NUM_OF_REF_FOR_TEAM_WALLET - 1; i++) {
          expect((await flower.users(accounts[i].address)).APR).to.be.equal(APR_FOR_REGULAR_WALLETS);
        }
      });

      it("Team should have 1% APR if their upline has 5 downlines or more", async () => {
        for (let i = 0; i < MIN_NUM_OF_REF_FOR_TEAM_WALLET; i++) {
          await simpleDeposit(accounts[i]);
        }

        // Test
        expect((await flower.users(owner.address)).APR).to.be.equal(APR_FOR_TEAM_WALLETS);
        for (let i = 0; i < MIN_NUM_OF_REF_FOR_TEAM_WALLET; i++) {
          expect((await flower.users(accounts[i].address)).APR).to.be.equal(APR_FOR_TEAM_WALLETS);
        }
      });

      it("Should successfully deposit with upline who's not eligible for rewards", async () => {
        // Prepare
        let expectedTotalUsers: BigNumber = (await flower.totalUsers()).add(1);
        let expectedUplineNumOfReferrals: number = (await flower.callStatic.getUserDownlines(uplineAddress)).length + 1;

        let expectedRealizedDepositAmount: BigNumber = depositAmount
          .div(2)
          .sub(depositRewardAmount);
        let expectedOverallDownlineDepositAmountNCTR: BigNumber = (
          await flower.users(accounts[0].address)
        ).depositsNCTR.add(expectedRealizedDepositAmount);
        let expectedOverallDownlineDepositAmountUSDce: BigNumber = (
          await flower.users(accounts[0].address)
        ).depositsUSDCe.add(expectedRealizedDepositAmount);
        let expectedOverallUplineDepositAmountNCTR: BigNumber = (
          await flower.users(uplineAddress)
        ).depositsNCTR;
        let expectedOverallUplineDepositAmountUSDce: BigNumber = (
          await flower.users(uplineAddress)
        ).depositsUSDCe;

        let expectedTotalDepositedNCTR: BigNumber = (
          await flower.totalDepositedNCTR()
        ).add(expectedRealizedDepositAmount);
        let expectedTotalDepositedUSDCe: BigNumber = (
          await flower.totalDepositedUSDCe()
        ).add(expectedRealizedDepositAmount);

        let expectedDevWalletNCTR: BigNumber = (
          await nectar.balanceOf(devWalletNCTR.address)
        ).add(depositRewardAmount);
        let expectedDevWalletUSDCe: BigNumber = (
          await nectar.balanceOf(devWalletUSDCe.address)
        ).add(depositRewardAmount);

        let expectedDailyClaimAmount: BigNumber = expectedOverallDownlineDepositAmountNCTR.mul(APR_FOR_REGULAR_WALLETS).div(1000);
        let expectedDailyClaimAmountUpline: BigNumber = (await flower.users(uplineAddress)).dailyClaimAmount;

        console.log((await flower.users(accounts[0].address)))
        // Test & Assert
        // Deposit first time - should set the upline also
        await expect(
          flower.connect(accounts[0]).deposit(depositAmount, uplineAddress)
        ).to.not.be.reverted;

        expect(await flower.totalUsers()).to.be.equal(expectedTotalUsers);
        expect((await flower.callStatic.getUserDownlines(uplineAddress)).length).to.be.equal(expectedUplineNumOfReferrals);

        console.log((await flower.users(accounts[0].address)))

        console.log('--')
        console.log(expectedOverallDownlineDepositAmountUSDce)

        expect(
          (await flower.users(accounts[0].address)).depositsNCTR
        ).to.be.equal(expectedOverallDownlineDepositAmountNCTR);
        expect(
          (await flower.users(accounts[0].address)).depositsUSDCe
        ).to.be.equal(expectedOverallDownlineDepositAmountUSDce);
        expect((await flower.users(uplineAddress)).depositsNCTR).to.be.equal(
          expectedOverallUplineDepositAmountNCTR
        );
        expect((await flower.users(uplineAddress)).depositsUSDCe).to.be.equal(
          expectedOverallUplineDepositAmountUSDce
        );

        expect(await flower.totalDepositedNCTR()).to.be.equal(
          expectedTotalDepositedNCTR
        );
        expect(await flower.totalDepositedUSDCe()).to.be.equal(
          expectedTotalDepositedUSDCe
        );

        expect(await nectar.balanceOf(devWalletNCTR.address)).to.be.equal(
          expectedDevWalletNCTR
        );
        expect(await usdce.balanceOf(devWalletUSDCe.address)).to.be.equal(
          expectedDevWalletUSDCe
        );

        expect(
          (await flower.users(accounts[0].address)).dailyClaimAmount
        ).to.be.equal(expectedDailyClaimAmount);
        expect(
          (await flower.users(uplineAddress)).dailyClaimAmount
        ).to.be.equal(expectedDailyClaimAmountUpline);

        // Deposit second time - upline should already be set
        await expect(
          flower.connect(accounts[0]).deposit(depositAmount, uplineAddress)
        ).to.not.be.reverted;

        expect(await flower.totalUsers()).to.be.equal(expectedTotalUsers);
        expect((await flower.callStatic.getUserDownlines(uplineAddress)).length).to.be.equal(expectedUplineNumOfReferrals);
      });

      it("Should successfully deposit if depositer is the owner and should not update its upline", async () => {
        // Prepare
        await usdce.approve(
          flower.address,
          depositAmount.mul(maxNumOfDeposits)
        );

        let expectedTotalUsers: BigNumber = await flower.totalUsers();
        let expectedUplineNumOfReferrals: number = (await flower.callStatic.getUserDownlines(uplineAddress)).length;

        let expectedRealizedDepositAmount: BigNumber = depositAmount
          .div(2)
          .sub(depositRewardAmount);
        let expectedOverallDownlineDepositAmountNCTR: BigNumber = (
          await flower.users(owner.address)
        ).depositsNCTR.add(expectedRealizedDepositAmount);
        let expectedOverallDownlineDepositAmountUSDce: BigNumber = (
          await flower.users(accounts[0].address)
        ).depositsUSDCe.add(expectedRealizedDepositAmount);

        let expectedTotalDepositedNCTR: BigNumber = (
          await flower.totalDepositedNCTR()
        ).add(expectedRealizedDepositAmount);
        let expectedTotalDepositedUSDCe: BigNumber = (
          await flower.totalDepositedUSDCe()
        ).add(expectedRealizedDepositAmount);

        let expectedDevWalletNCTR: BigNumber = (
          await nectar.balanceOf(devWalletNCTR.address)
        ).add(depositRewardAmount);
        let expectedDevWalletUSDCe: BigNumber = (
          await nectar.balanceOf(devWalletUSDCe.address)
        ).add(depositRewardAmount);

        let expectedDailyClaimAmount: BigNumber = expectedOverallDownlineDepositAmountNCTR.mul(APR_FOR_REGULAR_WALLETS).div(1000);

        // Test & Assert
        await expect(flower.deposit(depositAmount, uplineAddress)).to.not.be
          .reverted;

        expect(await flower.totalUsers()).to.be.equal(expectedTotalUsers);
        expect((await flower.callStatic.getUserDownlines(uplineAddress)).length).to.be.equal(expectedUplineNumOfReferrals);

        expect((await flower.users(owner.address)).depositsNCTR).to.be.equal(
          expectedOverallDownlineDepositAmountNCTR
        );
        expect((await flower.users(owner.address)).depositsUSDCe).to.be.equal(
          expectedOverallDownlineDepositAmountUSDce
        );

        expect(await flower.totalDepositedNCTR()).to.be.equal(
          expectedTotalDepositedNCTR
        );
        expect(await flower.totalDepositedUSDCe()).to.be.equal(
          expectedTotalDepositedUSDCe
        );

        expect(await nectar.balanceOf(devWalletNCTR.address)).to.be.equal(
          expectedDevWalletNCTR
        );
        expect(await usdce.balanceOf(devWalletUSDCe.address)).to.be.equal(
          expectedDevWalletUSDCe
        );
        expect(
          (await flower.users(owner.address)).dailyClaimAmount
        ).to.be.equal(expectedDailyClaimAmount);
      });

      it("Should successfully deposit if upline is eligible for rewards but not a Team wallet", async () => {
        // Prepare
        expect(tierNFT.balanceOf(uplineAddress, BigNumber.from("15"))).to.be.equal(1)
        await simpleDeposit(owner);

        let expectedRealizedDepositAmount: BigNumber = depositAmount
          .div(2)
          .sub(depositRewardAmount);
        let expectedOverallDownlineDepositAmountNCTR: BigNumber = (
          await flower.users(accounts[0].address)
        ).depositsNCTR.add(expectedRealizedDepositAmount);
        let expectedOverallDownlineDepositAmountUSDce: BigNumber = (
          await flower.users(accounts[0].address)
        ).depositsUSDCe.add(expectedRealizedDepositAmount);
        let expectedOverallUplineDepositAmountNCTR: BigNumber = (
          await flower.users(uplineAddress)
        ).depositsNCTR.add(depositRewardAmount);
        let expectedOverallUplineDepositAmountUSDce: BigNumber = (
          await flower.users(uplineAddress)
        ).depositsUSDCe;
        let expectedUplineUSDCeWalletAmount: BigNumber = (
          await usdce.balanceOf(uplineAddress)
        ).add(depositRewardAmount);

        let expectedTotalDepositedNCTR: BigNumber = (
          await flower.totalDepositedNCTR()
        ).add(expectedRealizedDepositAmount);
        let expectedTotalDepositedUSDCe: BigNumber = (
          await flower.totalDepositedUSDCe()
        ).add(expectedRealizedDepositAmount);

        let expectedDevWalletNCTR: BigNumber = await nectar.balanceOf(
          devWalletNCTR.address
        );
        let expectedDevWalletUSDCe: BigNumber = await nectar.balanceOf(
          devWalletUSDCe.address
        );

        let expectedDailyClaimAmount: BigNumber = expectedOverallDownlineDepositAmountNCTR.mul(APR_FOR_REGULAR_WALLETS).div(1000);
        let expectedDailyClaimAmountUpline: BigNumber = expectedOverallUplineDepositAmountNCTR.mul(APR_FOR_REGULAR_WALLETS).div(1000);

        // Test & Assert
        await expect(
          flower.connect(accounts[0]).deposit(depositAmount, uplineAddress)
        ).to.not.be.reverted;

        expect(
          (await flower.users(accounts[0].address)).depositsNCTR
        ).to.be.equal(expectedOverallDownlineDepositAmountNCTR);
        expect(
          (await flower.users(accounts[0].address)).depositsUSDCe
        ).to.be.equal(expectedOverallDownlineDepositAmountUSDce);
        expect((await flower.users(uplineAddress)).depositsNCTR).to.be.equal(
          expectedOverallUplineDepositAmountNCTR
        );
        expect((await flower.users(uplineAddress)).depositsUSDCe).to.be.equal(
          expectedOverallUplineDepositAmountUSDce
        );
        expect(await usdce.balanceOf(uplineAddress)).to.be.equal(
          expectedUplineUSDCeWalletAmount
        );

        expect(await flower.totalDepositedNCTR()).to.be.equal(
          expectedTotalDepositedNCTR
        );
        expect(await flower.totalDepositedUSDCe()).to.be.equal(
          expectedTotalDepositedUSDCe
        );

        expect(await nectar.balanceOf(devWalletNCTR.address)).to.be.equal(
          expectedDevWalletNCTR
        );
        expect(await usdce.balanceOf(devWalletUSDCe.address)).to.be.equal(
          expectedDevWalletUSDCe
        );
        expect(
          (await flower.users(accounts[0].address)).dailyClaimAmount
        ).to.be.equal(expectedDailyClaimAmount);
        expect(
          (await flower.users(uplineAddress)).dailyClaimAmount
        ).to.be.equal(expectedDailyClaimAmountUpline);
      });

      it("Should successfully deposit if upline is eligible for rewards and is a Team wallet", async () => {
        // Prepare
        let downlineRewardNCTR: BigNumber = depositRewardAmount
          .mul(await flower.teamWalletDownlineRewardPerc())
          .div(MAX_PERCENTAGE);
        await expect(tierNFT.balanceOf(uplineAddress, BigNumber.from("15"))).to.be.equal(1);

        // Make 4 deposit from 4 different users so that upline has 4 referrals before depositing with another new address
        await simpleDeposit(owner);
        await simpleDeposit(accounts[1]);
        await simpleDeposit(accounts[2]);
        await simpleDeposit(accounts[3]);
        await simpleDeposit(accounts[4]);

        let expectedRealizedDepositAmount: BigNumber = depositAmount
          .div(2)
          .sub(depositRewardAmount);
        let expectedOverallDownlineDepositAmountNCTR: BigNumber = (
          await flower.users(accounts[0].address)
        ).depositsNCTR
          .add(expectedRealizedDepositAmount)
          .add(downlineRewardNCTR);
        let expectedOverallDownlineDepositAmountUSDce: BigNumber = (
          await flower.users(accounts[0].address)
        ).depositsUSDCe.add(expectedRealizedDepositAmount);
        let expectedOverallUplineDepositAmountNCTR: BigNumber = (
          await flower.users(uplineAddress)
        ).depositsNCTR
          .add(depositRewardAmount)
          .sub(downlineRewardNCTR);
        let expectedOverallUplineDepositAmountUSDce: BigNumber = (
          await flower.users(uplineAddress)
        ).depositsUSDCe;
        let expectedUplineUSDCeWalletAmount: BigNumber = (
          await usdce.balanceOf(uplineAddress)
        ).add(depositRewardAmount);

        let expectedTotalDepositedNCTR: BigNumber = (
          await flower.totalDepositedNCTR()
        ).add(expectedRealizedDepositAmount);
        let expectedTotalDepositedUSDCe: BigNumber = (
          await flower.totalDepositedUSDCe()
        ).add(expectedRealizedDepositAmount);

        let expectedDevWalletNCTR: BigNumber = await nectar.balanceOf(
          devWalletNCTR.address
        );
        let expectedDevWalletUSDCe: BigNumber = await nectar.balanceOf(
          devWalletUSDCe.address
        );

        let expectedDailyClaimAmount: BigNumber = expectedOverallDownlineDepositAmountNCTR.mul(APR_FOR_TEAM_WALLETS).div(1000);
        let expectedDailyClaimAmountUpline: BigNumber = expectedOverallUplineDepositAmountNCTR.mul(APR_FOR_TEAM_WALLETS).div(1000);

        // Test & Assert
        await expect(
          flower.connect(accounts[0]).deposit(depositAmount, uplineAddress)
        ).to.not.be.reverted;

        expect(
          (await flower.users(accounts[0].address)).depositsNCTR
        ).to.be.equal(expectedOverallDownlineDepositAmountNCTR);
        expect(
          (await flower.users(accounts[0].address)).depositsUSDCe
        ).to.be.equal(expectedOverallDownlineDepositAmountUSDce);
        expect((await flower.users(uplineAddress)).depositsNCTR).to.be.equal(
          expectedOverallUplineDepositAmountNCTR
        );
        expect((await flower.users(uplineAddress)).depositsUSDCe).to.be.equal(
          expectedOverallUplineDepositAmountUSDce
        );
        expect(await usdce.balanceOf(uplineAddress)).to.be.equal(
          expectedUplineUSDCeWalletAmount
        );

        expect(await flower.totalDepositedNCTR()).to.be.equal(
          expectedTotalDepositedNCTR
        );
        expect(await flower.totalDepositedUSDCe()).to.be.equal(
          expectedTotalDepositedUSDCe
        );

        expect(await nectar.balanceOf(devWalletNCTR.address)).to.be.equal(
          expectedDevWalletNCTR
        );
        expect(await usdce.balanceOf(devWalletUSDCe.address)).to.be.equal(
          expectedDevWalletUSDCe
        );
        expect(
          (await flower.users(accounts[0].address)).dailyClaimAmount
        ).to.be.equal(expectedDailyClaimAmount);
        expect(
          (await flower.users(uplineAddress)).dailyClaimAmount
        ).to.be.equal(expectedDailyClaimAmountUpline);
      });
    });

    describe("Compound", () => {
      let compoundAmount: BigNumber;
      let compoundTaxedAmount: BigNumber;
      let compoundBurnPercNCTR: BigNumber;
      let compoundUplinePercNCTR: BigNumber;
      let compoundUplinePercUSDCe: BigNumber;

      beforeEach(async () => {
        compoundAmount = depositAmount.div(2).sub(depositRewardAmount);
        compoundTaxedAmount = compoundAmount
          .mul(await flower.compoundTax())
          .div(MAX_PERCENTAGE);
        compoundBurnPercNCTR = BigNumber.from(50);
        compoundUplinePercNCTR = BigNumber.from(45);
        compoundUplinePercUSDCe = BigNumber.from(5);

        await simpleDeposit(accounts[0]);
      });

      it("Should revert if compounder is not Bloom Referral node", async () => {
        await expect(
          flower.connect(accounts[0]).compoundRewards()
        ).to.be.reverted;
      });

      it("Should revert if compound amount is not greater than zero", async () => {
        await expect(
          flower.connect(accounts[0]).compoundRewards()
        ).to.be.reverted;
      });

      it("Should revert if compounder wants to compound more than it has deposited", async () => {
        await expect(flower.compoundRewards()).to.be.revertedWith(
          "Can't compound more than you have!"
        );
      });

      it("Should revert if last action was under 24h ago", async () => {
        await expect(
          flower.connect(accounts[0]).compoundRewards()
        ).to.be.revertedWith("Can't make two actions under 24h!");
      });

      it("Should succesfully compound if last action was over 24h ago", async () => {
        flower.changeNextActionTime(accounts[0].address, await (await flower.users(accounts[0].address)).lastActionTime);
        await expect(
          flower.connect(accounts[0]).compoundRewards()
        ).to.not.be.reverted;
      });

      it("Should reward dev's wallet if Round Robin system came to the top of the chain", async () => {
        // Prepare
        await simpleDeposit(owner);
        let devWalletRewardAmount: BigNumber = compoundTaxedAmount
          .mul(BigNumber.from(MAX_PERCENTAGE).sub(compoundBurnPercNCTR))
          .div(MAX_PERCENTAGE);
        let expectedDevWalletNCTRAmount: BigNumber = (
          await nectar.balanceOf(devWalletNCTR.address)
        ).add(devWalletRewardAmount);

        // Test & Assert
        await expect(flower.compoundRewards()).to.not.be.reverted;
        expect(
          (await flower.users(owner.address)).uplineRewardTracker
        ).to.be.equal(BigNumber.from("0"));
        expect(await nectar.balanceOf(devWalletNCTR.address)).to.be.equal(
          expectedDevWalletNCTRAmount
        );
      });

      it("Should reward eligible upline that is not a Team wallet", async () => {
        // Prepare
        let compoundUplineRewardNCTR: BigNumber = compoundTaxedAmount
          .mul(compoundUplinePercNCTR)
          .div(MAX_PERCENTAGE);
        let compoundUplineRewardUSDCe: BigNumber = compoundTaxedAmount
          .mul(compoundUplinePercUSDCe)
          .div(MAX_PERCENTAGE);
        await simpleDeposit(owner);
        flower.changeNextActionTime(accounts[0].address, await (await flower.users(accounts[0].address)).lastActionTime);

        await expect(tierNFT.balanceOf(uplineAddress, BigNumber.from("15"))).to.be.equal(1);

        let expectedTotalDepositedNCTR: BigNumber = (
          await flower.totalDepositedNCTR()
        ).add(compoundUplineRewardNCTR);
        let expectedOverallUplineDepositAmountNCTR: BigNumber = (
          await flower.users(uplineAddress)
        ).depositsNCTR.add(compoundUplineRewardNCTR);
        let expectedUplineUSDCeWalletAmount: BigNumber = (
          await usdce.balanceOf(uplineAddress)
        ).add(compoundUplineRewardUSDCe);
        let expectedCompounderOverallDepositAmountNCTR: BigNumber = (
          await flower.users(accounts[0].address)
        ).depositsNCTR;

        let APR: BigNumber = (await flower.users(accounts[0].address)).APR;
        let expectedDailyClaimAmount: BigNumber = expectedCompounderOverallDepositAmountNCTR.mul(APR).div(1000);
        let APRupline: BigNumber = (await flower.users(owner.address)).APR;
        let expectedDailyClaimAmountUpline: BigNumber = expectedOverallUplineDepositAmountNCTR.mul(APRupline).div(1000);

        // Test & Assert
        await expect(
          flower.connect(accounts[0]).compoundRewards()
        ).to.not.be.reverted;

        expect(await flower.totalDepositedNCTR()).to.be.equal(
          expectedTotalDepositedNCTR
        );
        expect((await flower.users(uplineAddress)).depositsNCTR).to.be.equal(
          expectedOverallUplineDepositAmountNCTR
        );
        expect(await usdce.balanceOf(uplineAddress)).to.be.equal(
          expectedUplineUSDCeWalletAmount
        );
        expect(
          (await flower.users(accounts[0].address)).depositsNCTR
        ).to.be.equal(expectedCompounderOverallDepositAmountNCTR);
        expect(
          (await flower.users(accounts[0].address)).dailyClaimAmount
        ).to.be.equal(expectedDailyClaimAmount);
        expect(
          (await flower.users(owner.address)).dailyClaimAmount
        ).to.be.equal(expectedDailyClaimAmountUpline);
      });

      it("Should reward eligible upline that is a Team wallet", async () => {
        // Prepare
        await simpleDeposit(owner);
        await simpleDeposit(accounts[1]);
        await simpleDeposit(accounts[2]);
        await simpleDeposit(accounts[3]);
        await simpleDeposit(accounts[4]);
        flower.changeNextActionTime(accounts[0].address, await (await flower.users(accounts[0].address)).lastActionTime);

        let compoundUplineRewardNCTR: BigNumber = compoundTaxedAmount
          .mul(compoundUplinePercNCTR)
          .div(MAX_PERCENTAGE);
        let compoundUplineRewardUSDCe: BigNumber = compoundTaxedAmount
          .mul(compoundUplinePercUSDCe)
          .div(MAX_PERCENTAGE);
        let compoundDownlineRewardNCTR: BigNumber = compoundUplineRewardNCTR
          .mul(await flower.teamWalletDownlineRewardPerc())
          .div(MAX_PERCENTAGE);

        await expect(tierNFT.balanceOf(uplineAddress, BigNumber.from("15"))).to.be.equal(1);

        let expectedTotalDepositedNCTR: BigNumber = (
          await flower.totalDepositedNCTR()
        ).add(compoundUplineRewardNCTR);
        let expectedOverallUplineDepositAmountNCTR: BigNumber = (
          await flower.users(uplineAddress)
        ).depositsNCTR
          .add(compoundUplineRewardNCTR)
          .sub(compoundDownlineRewardNCTR);
        let expectedUplineUSDCeWalletAmount: BigNumber = (
          await usdce.balanceOf(uplineAddress)
        ).add(compoundUplineRewardUSDCe);
        let expectedCompounderOverallDepositAmountNCTR: BigNumber = (
          await flower.users(accounts[0].address)
        ).depositsNCTR.add(compoundDownlineRewardNCTR);

        let APR: BigNumber = (await flower.users(accounts[0].address)).APR;
        let expectedDailyClaimAmount: BigNumber = expectedCompounderOverallDepositAmountNCTR.mul(APR).div(1000);
        let APRupline: BigNumber = (await flower.users(owner.address)).APR;
        let expectedDailyClaimAmountUpline: BigNumber = expectedOverallUplineDepositAmountNCTR.mul(APRupline).div(1000);

        // Test & Assert
        await expect(
          flower.connect(accounts[0]).compoundRewards()
        ).to.not.be.reverted;

        expect(await flower.totalDepositedNCTR()).to.be.equal(
          expectedTotalDepositedNCTR
        );
        expect((await flower.users(uplineAddress)).depositsNCTR).to.be.equal(
          expectedOverallUplineDepositAmountNCTR
        );
        expect(await usdce.balanceOf(uplineAddress)).to.be.equal(
          expectedUplineUSDCeWalletAmount
        );
        expect(
          (await flower.users(accounts[0].address)).depositsNCTR
        ).to.be.equal(expectedCompounderOverallDepositAmountNCTR);
        expect(
          (await flower.users(accounts[0].address)).dailyClaimAmount
        ).to.be.equal(expectedDailyClaimAmount);
        expect(
          (await flower.users(owner.address)).dailyClaimAmount
        ).to.be.equal(expectedDailyClaimAmountUpline);
      });
    });

    describe("Claim", () => {
      it("Should revert if claimer is not Bloom Referral node", async () => {
        await expect(flower.connect(accounts[0]).claim()).to.be.revertedWith("Caller must be in the Bloom Referral system!");
      });

      it("Should revert if claimer's NET DEPOSIT VALUE minus current daily amount is negative", async () => {
        await simpleDeposit(owner);
        await simpleDeposit(accounts[0]);
        await flower.changePayouts(accounts[0].address, await flower.getDepositedValue(accounts[0].address));

        // Test
        await expect(flower.connect(accounts[0]).claim()).to.be.revertedWith("Can't claim if your NET DEPOSITE VALUE - daily claim amount is negative!");
      });

      it("Should revert if claimer wants to claim more than 365% of DEPOSITED VALUE overall", async () => {
        await simpleDeposit(owner);
        await simpleDeposit(accounts[0]);
        await flower.changePayouts(accounts[0].address, (await flower.getDepositedValue(accounts[0].address)).mul(366).div(100));
        await flower.changeAirdropsGiven(accounts[0].address, (await flower.users(accounts[0].address)).payouts);

        // Test
        await expect(flower.connect(accounts[0]).claim()).to.be.revertedWith("Can't claim more than 365% of the DEPOSITED VALUE!");
      });

      it("Should revert if last action was under 24h ago", async () => {
        await simpleDeposit(owner);
        await simpleDeposit(accounts[0]);
        await expect(
          flower.connect(accounts[0]).claim()
        ).to.be.revertedWith("Can't make two actions under 24h!");
      });

      it("Should succesfully claim if last action was over 24h ago", async () => {
        await simpleDeposit(owner);
        await simpleDeposit(accounts[0]);
        flower.changeNextActionTime(accounts[0].address, await (await flower.users(accounts[0].address)).lastActionTime);
        let claimAmount: BigNumber = await (await flower.users(accounts[0].address)).dailyClaimAmount;
        await nectar.transfer(treasury.address, claimAmount);
        await treasury.addAddressesToWhitelist([flower.address]);

        // Test
        await expect(
          flower.connect(accounts[0]).claim()
        ).to.not.be.reverted;
      });

      it("Should successfully claim NCTR if treasury has enough amount to claim from", async () => {
        // Prepare
        await simpleDeposit(accounts[0]);
        flower.changeNextActionTime(accounts[0].address, await (await flower.users(accounts[0].address)).lastActionTime);
        let claimAmount: BigNumber = await (await flower.users(accounts[0].address)).dailyClaimAmount;
        await nectar.transfer(treasury.address, claimAmount);
        await treasury.addAddressesToWhitelist([flower.address]);

        let expectedTotalWithdraw: BigNumber = (
          await flower.totalWithdraw()
        ).add(claimAmount);
        let expectedUserOverallPayouts: BigNumber = (
          await flower.users(accounts[0].address)
        ).payouts.add(claimAmount);

        // Test & Assert
        await expect(flower.connect(accounts[0]).claim()).to.not.be.reverted;

        expect(await flower.totalWithdraw()).to.be.equal(expectedTotalWithdraw);
        expect((await flower.users(accounts[0].address)).payouts).to.be.equal(
          expectedUserOverallPayouts
        );
      });

      it("Should successfully claim NCTR if treasury doesn't have enough amount to claim from", async () => {
        // Prepare
        await simpleDeposit(accounts[0]);
        flower.changeNextActionTime(accounts[0].address, (await flower.users(accounts[0].address)).lastActionTime);
        let claimAmount: BigNumber = (await flower.users(accounts[0].address)).dailyClaimAmount;
        await treasury.addAddressesToWhitelist([flower.address]);
        await nectar.transfer(treasury.address, claimAmount.sub(1));
        await nectar
          .connect(owner)
          .approve(flower.address, BigNumber.from("1"));

        let expectedTotalWithdraw: BigNumber = (
          await flower.totalWithdraw()
        ).add(claimAmount);
        let expectedUserOverallPayouts: BigNumber = (
          await flower.users(accounts[0].address)
        ).payouts.add(claimAmount);

        // Test & Assert
        await flower.connect(accounts[0]).claim();

        expect(await flower.totalWithdraw()).to.be.equal(expectedTotalWithdraw);
        expect((await flower.users(accounts[0].address)).payouts).to.be.equal(
          expectedUserOverallPayouts
        );
      });
    });

    describe("Airdrop", () => {
      let airdropAmount: BigNumber;

      beforeEach(async () => {
        airdropAmount = depositAmount.div(2).sub(depositRewardAmount);
      });

      it("Should revert if airdropper is not Bloom Referral node", async () => {
        await expect(
          flower.connect(accounts[0]).airdrop([owner.address], [airdropAmount])
        ).to.be.revertedWith("Caller must be in the Bloom Referral system!");
      });

      it("Should revert if number of receivers is not equal to number of airdrops", async () => {
        await simpleDeposit(accounts[0]);

        // Test
        await expect(
          flower.connect(accounts[0]).airdrop([owner.address], [airdropAmount, airdropAmount])
        ).to.be.revertedWith("Receivers and airdrops array lengths must be equal!");
      });

      it("Should revert if all of the airdrop amounts are not greater than zero", async () => {
        await simpleDeposit(accounts[0]);
        await simpleDeposit(accounts[1]);

        // Test
        await expect(
          flower.connect(accounts[0]).airdrop([owner.address, accounts[1].address], [airdropAmount, BigNumber.from("0")])
        ).to.be.revertedWith("Can't airdrop amount equal to zero!");
      });

      it("Should revert if all receivers are not in the BloomRefferal system", async () => {
        await simpleDeposit(accounts[0]);

        // Test
        await expect(
          flower.connect(accounts[0]).airdrop([owner.address, accounts[1].address], [airdropAmount, airdropAmount])
        ).to.be.revertedWith("Can't airdrop to someone that's not in the Bloom Referral system!");
      });

      it("Should successfully airdrop", async () => {
        // Prepare
        let totalAirdropAmount: BigNumber = airdropAmount.mul(2);
        await simpleDeposit(owner);
        await simpleDeposit(accounts[0]);
        await simpleDeposit(accounts[1]);
        await nectar.transfer(accounts[0].address, totalAirdropAmount);
        await nectar
          .connect(accounts[0])
          .approve(flower.address, totalAirdropAmount);

        let expectedReceiver1OverallDepositsNCTR: BigNumber = (
          await flower.users(owner.address)
        ).depositsNCTR;
        let expectedReceiver1OverallAirdropsReceived: BigNumber = (
          await flower.airdrops(owner.address)
        ).airdropsReceived.add(airdropAmount);
        let expectedReceiver2OverallDepositsNCTR: BigNumber = (
          await flower.users(accounts[1].address)
        ).depositsNCTR;
        let expectedReceiver2OverallAirdropsReceived: BigNumber = (
          await flower.airdrops(accounts[1].address)
        ).airdropsReceived.add(airdropAmount);
        let expectedAirdropperOverallAirdropsGiven: BigNumber = (
          await flower.airdrops(accounts[0].address)
        ).airdropsGiven.add(totalAirdropAmount);
        let expectedTotalAirdrops: BigNumber = (
          await flower.totalAirdrops()
        ).add(totalAirdropAmount);

        let expectedDailyClaimAmount1: BigNumber = (expectedReceiver1OverallDepositsNCTR.add(expectedReceiver1OverallAirdropsReceived))
          .mul(APR_FOR_REGULAR_WALLETS).div(1000);
        let expectedDailyClaimAmount2: BigNumber = (expectedReceiver2OverallDepositsNCTR.add(expectedReceiver2OverallAirdropsReceived))
          .mul(APR_FOR_REGULAR_WALLETS).div(1000);

        // Test & Assert
        await expect(
          flower
            .connect(accounts[0])
            .airdrop([owner.address, accounts[1].address], [airdropAmount, airdropAmount])
        ).to.not.be.reverted;

        expect(
          (await flower.users(owner.address)).depositsNCTR
        ).to.be.equal(expectedReceiver1OverallDepositsNCTR);
        expect(
          (await flower.airdrops(owner.address)).airdropsReceived
        ).to.be.equal(expectedReceiver1OverallAirdropsReceived);
        expect(
          (await flower.users(accounts[1].address)).depositsNCTR
        ).to.be.equal(expectedReceiver2OverallDepositsNCTR);
        expect(
          (await flower.airdrops(accounts[1].address)).airdropsReceived
        ).to.be.equal(expectedReceiver2OverallAirdropsReceived);
        expect(
          (await flower.airdrops(accounts[0].address)).airdropsGiven
        ).to.be.equal(expectedAirdropperOverallAirdropsGiven);
        expect(await flower.totalAirdrops()).to.be.equal(expectedTotalAirdrops);

        expect((await flower.users(owner.address)).dailyClaimAmount).to.be.equal(expectedDailyClaimAmount1);
        expect((await flower.users(accounts[1].address)).dailyClaimAmount).to.be.equal(expectedDailyClaimAmount2);
      });
    });
  });
});