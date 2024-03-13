import { upgrades, ethers } from "hardhat";

const main = async () => {
    const FlowerUpgradeable = await ethers.getContractFactory("FlowerUpgradeable");
    await (await upgrades.upgradeProxy("<FLOWER_ADDRESS>", FlowerUpgradeable)).deployed();
};

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});