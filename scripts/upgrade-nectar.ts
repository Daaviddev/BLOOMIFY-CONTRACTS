import { ethers, upgrades } from "hardhat";

const NECTAR_ADDRESS = "0x94B20a489641d4BE4bfdAB8df39D3F9B381B1F82";
const ROUTER_ADDRESS = "0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901";
const MANAGER_ADDRESS = "0x696efB2daFD37B8056ffb3F87A420d9cfCe8B67d";
const FLOWER_ADDRESS = "0x2547CEABcf0c34537911aAbEFf77DFbA6e3eF2FF";

const main = async () => {
  const Nectar = await ethers.getContractFactory("Nectar");
  await (await upgrades.upgradeProxy(NECTAR_ADDRESS, Nectar)).deployed();

  /* const nectar = await ethers.getContractAt("Nectar", NECTAR_ADDRESS); */
  /* const bloomManager = await ethers.getContractAt(
    "BloomsManagerUpgradeable",
    MANAGER_ADDRESS
  );
  const flower = await ethers.getContractAt(
    "FlowerUpgradeable",
    FLOWER_ADDRESS
  ); */

  /* await nectar.setRouterAddress(ROUTER_ADDRESS, {gasPrice: 1000000000000});
  await bloomManager.setRouterAddress(ROUTER_ADDRESS, {gasPrice: 1000000000000});
  await flower.setRouterAddress(ROUTER_ADDRESS, {gasPrice: 1000000000000}); */

  console.log("Done");
};

main();
