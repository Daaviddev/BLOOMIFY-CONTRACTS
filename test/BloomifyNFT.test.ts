import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";
import { BloomifyNFT, USDC } from "./../typechain";
import { deployContract, deployUpgradeableContract } from "../scripts/utils";

describe("BloomifyNFT test with a mock USDC contract", () => {
  let accounts: SignerWithAddress[];
  let owner: SignerWithAddress;
  let randBuyer: SignerWithAddress;
  let bloomifyNFT: BloomifyNFT;
  let usdc: USDC;

  beforeEach(async () => {
    [owner, randBuyer, ...accounts] = await ethers.getSigners();

    usdc = await deployUpgradeableContract<USDC>("USDC");

    bloomifyNFT = await deployUpgradeableContract<BloomifyNFT>("BloomifyNFT", ["", usdc.address]);
  });

  it("Should successfully withdraw a USDC.e tokens from Bloomify NFT contract", async () => {
    const tier1Price = 10 * 10 ** 6;

    await expect(bloomifyNFT.withdraw(accounts[0].address, tier1Price)).to.be.reverted;

    await bloomifyNFT.startMint(true);

    await usdc.approve(bloomifyNFT.address, tier1Price);
    await bloomifyNFT.mint(owner.address, 1);

    await expect(bloomifyNFT.withdraw(accounts[0].address, tier1Price)).to.not.be.reverted;
    expect(await usdc.balanceOf(accounts[0].address)).to.be.equal(tier1Price);
  })

  it("Should successfully mint a BloomifyNFT", async () => {
    const tier1Price = 10 * 10 ** 6;
    const tier5Price = 250 * 10 ** 6;
    const tier10Price = 1000 * 10 ** 6;

    await usdc.approve(bloomifyNFT.address, tier1Price);

    await expect(bloomifyNFT.mint(owner.address, 1)).to.be.revertedWith("Minting not allowed");

    await bloomifyNFT.startMint(true);
    await expect(bloomifyNFT.mint(owner.address, 2)).to.be.revertedWith(
      "ERC20: insufficient allowance"
    );

    await bloomifyNFT.mint(owner.address, 1);
    expect((await bloomifyNFT.balanceOf(owner.address, 1)).eq(1)).to.be.true;

    await usdc.approve(bloomifyNFT.address, tier5Price);

    await bloomifyNFT.mint(owner.address, 5);
    expect((await bloomifyNFT.balanceOf(owner.address, 5)).eq(1)).to.be.true;

    await usdc.approve(bloomifyNFT.address, tier10Price);

    await bloomifyNFT.mint(owner.address, 10);
    expect((await bloomifyNFT.balanceOf(owner.address, 10)).eq(1)).to.be.true;


    const ids = [1, 2, 3]
    const values = [10, 20, 30];

    await bloomifyNFT.mintBatch(owner.address, ids, values, "0x");
    expect(await (await bloomifyNFT.balanceOf(owner.address, 1)).eq(11)).to.be
      .true;
  });

  it("Should successfully mint and automatically burn tokens from a non-owner account", async () => {
    const tier1Price = 10 * 10 ** 6;
    const tier5Price = 250 * 10 ** 6;
    const tier10Price = 1000 * 10 ** 6;

    const ids = [1, 2, 3]
    const values = [10, 20, 30];

    await bloomifyNFT.startMint(true);

    await usdc.transfer(randBuyer.address, 3000 * 10 ** 6);
    await usdc.connect(randBuyer).approve(bloomifyNFT.address, tier1Price);

    await bloomifyNFT.connect(randBuyer).mint(randBuyer.address, 1);
    expect((await bloomifyNFT.balanceOf(randBuyer.address, 1)).eq(1)).to.be.true;

    await usdc.connect(randBuyer).approve(bloomifyNFT.address, tier5Price);

    await bloomifyNFT.connect(randBuyer).mint(randBuyer.address, 5);
    expect((await bloomifyNFT.balanceOf(randBuyer.address, 5)).eq(1)).to.be.true;
    expect((await bloomifyNFT.balanceOf(randBuyer.address, 1)).eq(0)).to.be.true;

    await expect(bloomifyNFT.connect(randBuyer).mint(randBuyer.address, 10)).to.be.revertedWith("ERC20: insufficient allowance");

    await expect(bloomifyNFT.connect(randBuyer).mintBatch(randBuyer.address, ids, values, "0x")).to.be.revertedWith("Ownable: caller is not the owner");
  })
});
