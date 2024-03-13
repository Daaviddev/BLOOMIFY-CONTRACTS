import { ethers } from "hardhat";
import { expect } from "chai";
import { ERC20BurnableUpgradeable, TreasuryUpgradeable } from "./../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { deployContract, deployUpgradeableContract } from "../scripts/utils";

const MIM_AMOUNT_TO_SEND = 1;

describe("Treasury", () => {
  let treasury: TreasuryUpgradeable;
  let nectar: ERC20BurnableUpgradeable;
  let usdce: ERC20BurnableUpgradeable;
  
  let owner: SignerWithAddress;
  let accounts: SignerWithAddress[];

  beforeEach(async () => {
    [owner, ...accounts] = await ethers.getSigners();

    nectar = await deployContract("NE", [
      "Nectar",
      "NCTR",
      ethers.utils.parseEther("100"),
    ]);
    usdce = await deployContract("ERC20BurnableUpgradeable");

    treasury = await deployUpgradeableContract("TreasuryUpgradeable", [
      nectar.address,
      usdce.address,
    ]);
  });

  describe("Initialization", () => {
    it("Should successfully initialize the owner", async () => {
      expect(await treasury.owner()).to.equal(owner.address);
    });
  });

  describe("Whitelist", () => {
    it("Should successfully add and remove addresses from whitelist", async () => {
      // Add accounts[0] to the whitelist
      await treasury.addAddressesToWhitelist([accounts[0].address]);
      expect(await treasury.whitelist(accounts[0].address)).to.be.true;

      // Remove accounts[0] from the whitelist
      await treasury.removeAddressesFromWhitelist([accounts[0].address]);
      expect(await treasury.whitelist(accounts[0].address)).to.be.false;
    });

    it("Should revert if non-owner wants to add or remove someone from whitelist", async () => {
      // Try to add someone to whitelist
      await expect(
        treasury
          .connect(accounts[0])
          .addAddressesToWhitelist([accounts[0].address])
      ).to.be.revertedWith("Ownable: caller is not the owner");

      // Try to remove someone from whitelist
      await expect(
        treasury
          .connect(accounts[0])
          .removeAddressesFromWhitelist([accounts[0].address])
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Withdraw", () => {
    it("Should successfully withdraw NCTR and USDCe from the Treasury", async () => {
      await treasury.addAddressesToWhitelist([accounts[0].address]);
      const amountToWithdraw = ethers.utils.parseEther(
        MIM_AMOUNT_TO_SEND.toString()
      );

      // Withdraw NCTR
      await nectar.transfer(treasury.address, amountToWithdraw);
      await treasury
        .connect(accounts[0])
        .withdrawNCTR(accounts[0].address, amountToWithdraw);

      expect(await nectar.balanceOf(accounts[0].address)).to.be.equal(
        amountToWithdraw
      );

      // Withdraw USDC.e
      await usdce.transfer(treasury.address, amountToWithdraw);
      await treasury
        .connect(accounts[0])
        .withdrawUSDCe(accounts[0].address, amountToWithdraw);

      expect(await usdce.balanceOf(accounts[0].address)).to.be.equal(
        amountToWithdraw
      );
    });

    it("Should revert if non-owner wants to withdraw NCTR or USDC.e", async () => {
      // Try to withdraw NCTR if sender is not whitelisted
      await expect(
        treasury
          .connect(accounts[0])
          .withdrawNCTR(accounts[0].address, MIM_AMOUNT_TO_SEND)
      ).to.be.revertedWith("Not whitelisted!");

      // Try to withdraw USDC.e if sender is not whitelisted
      await expect(
        treasury
          .connect(accounts[0])
          .withdrawUSDCe(accounts[0].address, MIM_AMOUNT_TO_SEND)
      ).to.be.revertedWith("Not whitelisted!");
    });
  });
});
