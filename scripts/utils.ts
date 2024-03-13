import * as fs from "fs";
import { Contract } from "ethers/lib/ethers";
import { ethers, upgrades } from "hardhat";

export const deployContract = async <T extends Contract>(
  factoryName: string,
  args?: any[]
) => {
  const Factory = await ethers.getContractFactory(factoryName);
  const contract = args
    ? await Factory.deploy(...args)
    : await Factory.deploy();
  await contract.deployed();

  return contract as T;
};

export const deployUpgradeableContract = async <T extends Contract>(
  factoryName: string,
  args?: any[],
  initializer?: string
) => {
  const Factory = await ethers.getContractFactory(factoryName);

  let contract: T;

  if (args) {
    if (initializer) {
      contract = (await upgrades.deployProxy(Factory, args, {
        initializer,
      })) as T;
    } else {
      contract = (await upgrades.deployProxy(Factory, args)) as T;
    }
  } else {
    contract = initializer
      ? ((await upgrades.deployProxy(Factory, { initializer })) as T)
      : ((await upgrades.deployProxy(Factory)) as T);
  }

  await contract.deployed();

  return contract;
};

export const add2Details = (
  fileName: string,
  address: string,
  networkName: string
) => {
  const dirName = "deployment_details";
  const dirPath = `${process.cwd()}/${dirName}`;
  const filePath = `${dirPath}/${fileName}.json`;

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ [networkName]: address }));
  } else {
    const details = JSON.parse(
      fs.readFileSync(filePath, { encoding: "utf-8" })
    );

    details[networkName] = address;

    fs.writeFileSync(filePath, JSON.stringify(details));
  }
};
