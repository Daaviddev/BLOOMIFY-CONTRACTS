import { upgrades, ethers } from "hardhat";

const main = async () => {
  const FlowerUpgradeable = await ethers.getContractFactory(
    "FlowerUpgradeable"
  );
  await (
    await upgrades.upgradeProxy(
      "0xcECdB97228d6da0AfA88E7692350FF0009c0Cc19",
      FlowerUpgradeable
    )
  ).deployed();

  console.log("Done!")
};

main();
