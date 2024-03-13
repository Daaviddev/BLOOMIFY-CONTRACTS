import { ethers, upgrades } from "hardhat";

const main = async () => {
  const BloomsManager = await ethers.getContractFactory(
    "BloomsManagerUpgradeable"
  );
  await (
    await upgrades.upgradeProxy(
      "0x696efB2daFD37B8056ffb3F87A420d9cfCe8B67d",
      BloomsManager
    )
  ).deployed();
};

main();
