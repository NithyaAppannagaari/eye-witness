import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const SEPOLIA_RPC = process.env.NEXT_PUBLIC_BASE_RPC_URL || "";
const MAINNET_RPC = process.env.MAINNET_RPC_URL || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {},
    ...(SEPOLIA_RPC && DEPLOYER_PRIVATE_KEY
      ? {
          sepolia: {
            url: SEPOLIA_RPC,
            accounts: [DEPLOYER_PRIVATE_KEY],
            chainId: 11155111,
          },
        }
      : {}),
    ...(MAINNET_RPC && DEPLOYER_PRIVATE_KEY
      ? {
          mainnet: {
            url: MAINNET_RPC,
            accounts: [DEPLOYER_PRIVATE_KEY],
            chainId: 1,
          },
        }
      : {}),
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
