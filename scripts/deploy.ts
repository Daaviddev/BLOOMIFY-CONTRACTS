import { BigNumber } from "ethers";
import { network, upgrades } from "hardhat";

import { add2Details, deployUpgradeableContract } from "./utils";
import {
  BloomNFT,
  BloomsManagerUpgradeable,
  BloomifyNFT,
  FlowerUpgradeable,
  Nectar,
  TreasuryUpgradeable,
  Whitelist,
} from "../typechain";

import { ethers } from "hardhat";

const main = async () => {
  const [deployer] = await ethers.getSigners();

  const nectar = await deployUpgradeableContract<Nectar>("Nectar", [
    BigNumber.from("200"),
  ]);
  console.log("Nectar deployed to: ", nectar.address);
  add2Details("Nectar", nectar.address, network.name);
  add2Details(
    "Nectar_Implementation",
    await upgrades.erc1967.getImplementationAddress(nectar.address),
    network.name
  );

  const bloomifyNFT = await deployUpgradeableContract<BloomifyNFT>(
    "BloomifyNFT",
    [process.env.BLOOM_TIERS_NFT_URI,process.env.USDCe_ADDRESS]
  );
  console.log("BloomifyNFT NFT deployed to: ", bloomifyNFT.address);
  add2Details("BloomifyNFT", bloomifyNFT.address, network.name);
  add2Details(
    "BloomifyNFT_Implementation",
    await upgrades.erc1967.getImplementationAddress(bloomifyNFT.address),
    network.name
  );

  const bloomNFT = await deployUpgradeableContract<BloomNFT>("BloomNFT", [
    process.env.BLOOM_NFT_URI
  ]);
  console.log("Bloom NFT deployed to: ", bloomNFT.address);
  add2Details("Bloom NFT", bloomNFT.address, network.name);
  add2Details(
    "Bloom NFT_Implementation",
    await upgrades.erc1967.getImplementationAddress(bloomNFT.address),
    network.name
  );

  const whitelist = await deployUpgradeableContract<Whitelist>(
    "Whitelist",
    undefined,
    "__Whitelist_init"
  );
  console.log("Whitelist deployed to: ", whitelist.address);
  add2Details("Whitelist", whitelist.address, network.name);
  add2Details(
    "Whitelist_Implementation",
    await upgrades.erc1967.getImplementationAddress(whitelist.address),
    network.name
  );

  const treasury = await deployUpgradeableContract<TreasuryUpgradeable>(
    "TreasuryUpgradeable",
    [nectar.address, process.env.USDCe_ADDRESS]
  );
  console.log("Treasury deployed to: ", treasury.address);
  add2Details("Treasury", treasury.address, network.name);
  add2Details(
    "Treasury_Implementation",
    await upgrades.erc1967.getImplementationAddress(treasury.address),
    network.name
  );

  const bloomManager =
    await deployUpgradeableContract<BloomsManagerUpgradeable>(
      "BloomsManagerUpgradeable",
      [
        process.env.LIQUIDITY_MANAGER_ADDRESS,
        process.env.ROUTER_ADDRESS,
        treasury.address,
        process.env.USDCe_ADDRESS,
        nectar.address,
        bloomNFT.address,
        whitelist.address,
        BigNumber.from(process.env.REWARD_PER_DAY),
      ]
    );
  console.log("BloomManager deployed to: ", bloomManager.address);
  add2Details("BloomManager", bloomManager.address, network.name);
  add2Details(
    "BloomManager_Implementation",
    await upgrades.erc1967.getImplementationAddress(bloomManager.address),
    network.name
  );

  const flower = await deployUpgradeableContract<FlowerUpgradeable>(
    "FlowerUpgradeable",
    [
      bloomifyNFT.address,
      nectar.address,
      process.env.USDCe_ADDRESS,
      treasury.address,
      process.env.ROUTER_ADDRESS,
      process.env.DEV_WALLET_NCTR,
      process.env.DEV_WALLET_USDCe,
      process.env.LIQUIDITY_MANAGER_ADDRESS
    ]
  );
  console.log("Flower deployed to: ", flower.address);
  add2Details("Flower", flower.address, network.name);
  add2Details(
    "Flower_Implementation",
    await upgrades.erc1967.getImplementationAddress(flower.address),
    network.name
  );

  console.log("Calling setters...");

  await nectar.setBloomNodes(bloomManager.address);
  await nectar.setBloomReferral(flower.address);
  await nectar.setLiquidityManager(`${process.env.LIQUIDITY_MANAGER_ADDRESS}`);
  await nectar.setRewardsPool(treasury.address); // if rewards pool and treasury are not the same (which seems to be the case), change the address to `${process.env.BLOOMIFY_REWARDS_POOL}`
  await nectar.setTreasuryAddress(treasury.address);

  await bloomManager.setDevWallet(`${process.env.DEV_WALLET_USDCe}`);
  await bloomManager.setRewardsPool(treasury.address); // check this as well, and if necessary change to `${process.env.BLOOMIFY_REWARDS_POOL}` as well

  await treasury.addAddressesToWhitelist([flower.address]);
  await bloomNFT.setBloomNodes(bloomManager.address);

  /**
   * !!! IMPORTANT !!!
   * These three calls
   * await nectar.setPairAddress(`${process.env.PAIR_ADDRESS}`);
   * await bloomManager.setPairAddress(`${process.env.PAIR_ADDRESS}`);
   * await flower.setPairAddress(`${process.env.PAIR_ADDRESS}`);
   * alongisde the 4 calls to the LMS contract, need to be made after the NCTR/USDC.e pair is created
   */
  await nectar.mintNectar(deployer.address, ethers.utils.parseEther("100"));
  // await nectar.mintNectar(bloomManager.address, ethers.utils.parseEther("10"));
  // await nectar.mintNectar(flower.address, ethers.utils.parseEther("10"));

  // Testing only functions
  /** 
    await flower.transferOwnership(ADMIN);
    await nectar.transferOwnership(ADMIN);
    await bloomManager.transferOwnership(ADMIN);
    await nectar.transfer(ADMIN, await nectar.balanceOf(deployer.address));
  */

  console.log("Done!");
};

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
